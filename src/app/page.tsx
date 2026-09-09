import type { Metadata } from 'next'
import { LoginScreen } from '@/components/login-screen'

export const metadata: Metadata = {
  title: 'Connexion',
  description: 'Connectez MBA Player à votre portail Xtream Codes.',
}

export default function LoginPage() {
  return <LoginScreen />
}
