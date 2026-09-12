import { describe, expect, it } from 'vitest'
import { redactUrl } from '@/lib/redact'

const USER = 'GayeMBDagwal'
const PASS = 'XHxH5LU6rcWFJz'

describe('redactUrl', () => {
  it('masks credentials carried as path segments', () => {
    expect(
      redactUrl(`http://portal.tv:8080/timeshift/${USER}/${PASS}/49/2026-09-11:22-45/65010.m3u8`, [
        USER,
        PASS,
      ]),
    ).toBe('http://portal.tv:8080/timeshift/***/***/49/2026-09-11:22-45/65010.m3u8')
  })

  it('masks credentials carried as query parameters', () => {
    expect(
      redactUrl(`http://portal.tv:8080/get.php?username=${USER}&password=${PASS}&type=m3u_plus`, [
        USER,
        PASS,
      ]),
    ).toBe('http://portal.tv:8080/get.php?username=***&password=***&type=m3u_plus')
  })

  it('masks the percent-encoded form as well', () => {
    const pass = 'a/b+c'
    expect(redactUrl(`http://portal.tv/live/user/${encodeURIComponent(pass)}/1.ts`, [pass])).toBe(
      'http://portal.tv/live/user/***/1.ts',
    )
  })

  it('leaves everything else legible', () => {
    const masked = redactUrl(
      `http://1.fr2fr.top:8080/timeshift/${USER}/${PASS}/49/2026-09-11:22-45/65010.m3u8`,
      [USER, PASS],
    )
    expect(masked).toContain('1.fr2fr.top:8080')
    expect(masked).toContain('2026-09-11:22-45')
    expect(masked).toContain('65010.m3u8')
    expect(masked).not.toContain(PASS)
  })

  it('skips secrets too short to mask safely', () => {
    expect(redactUrl('http://portal.tv/live/ab/pw/1.ts', ['ab'])).toBe(
      'http://portal.tv/live/ab/pw/1.ts',
    )
  })

  it('tolerates missing secrets', () => {
    expect(redactUrl('http://portal.tv/x', [undefined, '', '   '])).toBe('http://portal.tv/x')
  })
})
