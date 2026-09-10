import { gunzipSync } from "node:zlib";
import { NextResponse } from "next/server";
import { UnsafeUrlError, assertFetchableUrl } from "@/lib/server/safe-fetch";
import { PORTAL_USER_AGENT } from "@/lib/server/user-agent";

/**
 * Fetches an XMLTV guide for the client.
 *
 * Same reasons as the other proxy routes — no CORS headers upstream, http-only
 * origins — plus decompression, which is this route's own job: providers serve
 * the same guide as `.xml` or `.xml.gz` more or less at random.
 */

const REQUEST_TIMEOUT_MS = 90_000;

/**
 * Guides are large, and a gzipped one expands several times over. The cap
 * applies to the decompressed size, since that is what has to fit in memory.
 */
const MAX_BYTES = 192 * 1024 * 1024;

/** gzip's magic number, which is how a .gz served as a plain file is spotted. */
const GZIP_MAGIC = [0x1f, 0x8b];

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** The attempted URL with credentials masked, safe to show the user. */
function redacted(target: string): string {
  try {
    const url = new URL(target);
    for (const key of ["username", "password"]) {
      if (url.searchParams.has(key)) url.searchParams.set(key, "***");
    }
    return url.toString();
  } catch {
    return "(URL invalide)";
  }
}

export async function POST(request: Request) {
  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return badRequest("Corps de requête JSON invalide.");
  }

  const target = typeof body.url === "string" ? body.url.trim() : "";
  if (!target) return badRequest("Adresse du guide manquante.");

  try {
    await assertFetchableUrl(target);
  } catch (error) {
    if (error instanceof UnsafeUrlError) return badRequest(error.message);
    throw error;
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: { "User-Agent": PORTAL_USER_AGENT, Accept: "*/*" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
      redirect: "follow",
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return NextResponse.json(
      {
        error: timedOut
          ? "Le guide n’a pas répondu à temps. Les guides complets sont longs à générer."
          : "Impossible de joindre le guide. Vérifiez l’adresse.",
      },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    return NextResponse.json(
      {
        error: `Le guide a répondu ${upstream.status} ${upstream.statusText} pour ${redacted(target)}.`,
      },
      { status: 502 },
    );
  }

  let raw: Buffer;
  try {
    const received = Buffer.from(await upstream.arrayBuffer());
    if (received.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { error: "Guide trop volumineux." },
        { status: 502 },
      );
    }
    raw = received;
  } catch {
    return NextResponse.json(
      { error: "Transfert du guide interrompu." },
      { status: 502 },
    );
  }

  // `fetch` unwraps Content-Encoding on its own, but a .gz served as a plain
  // file carries no such header — so the bytes themselves are the only
  // reliable signal.
  let text: string;
  if (raw.length >= 2 && raw[0] === GZIP_MAGIC[0] && raw[1] === GZIP_MAGIC[1]) {
    try {
      const expanded = gunzipSync(raw, { maxOutputLength: MAX_BYTES });
      text = expanded.toString("utf8");
    } catch {
      return NextResponse.json(
        {
          error:
            "Le guide est compressé mais illisible (fichier tronqué, ou trop volumineux une fois décompressé).",
        },
        { status: 502 },
      );
    }
  } else {
    text = raw.toString("utf8");
  }

  // A provider refusing the credentials answers with an HTML error page and a
  // 200 just as readily here as it does for a playlist.
  if (!/<tv\b/i.test(text) && !/<programme\b/i.test(text)) {
    return NextResponse.json(
      {
        error: `La réponse de ${redacted(target)} n’est pas un guide XMLTV. Identifiants refusés, ou l’adresse pointe vers autre chose.`,
      },
      { status: 502 },
    );
  }

  return new NextResponse(text, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
