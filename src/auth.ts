import NextAuth from 'next-auth'
import type { NextAuthConfig, DefaultSession } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

interface UserRecord {
  id: string
  email: string
  name: string | null
}

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
    } & DefaultSession['user']
  }
}

const credentialsProvider = Credentials({
  name: 'Credentials',
  credentials: {
    email: { label: 'Email', type: 'email' },
    password: { label: 'Password', type: 'password' },
  },
  authorize: async (credentials) => {
    if (!credentials?.email || !credentials?.password) return null
    const user = await prisma.user.findUnique({ where: { email: credentials.email as string } })
    if (!user) return null
    const isValid = await bcrypt.compare(credentials.password as string, user.password)
    if (!isValid) return null
    return { id: user.id, email: user.email, name: user.name } satisfies UserRecord
  },
})

export const authOptions = {
  providers: [credentialsProvider],
  session: { strategy: 'jwt' as const },
  callbacks: {
    jwt: ({ token, user }) => {
      if (user && 'id' in user) {
        ;(token as Record<string, unknown>).id = (user as UserRecord).id
      }
      return token
    },
    session: ({ session, token }) => {
      if (session.user) {
        const t = token as Record<string, unknown>
        if (t.id && typeof t.id === 'string') {
          ;(session.user as { id: string } & DefaultSession['user']).id = t.id
        }
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
} satisfies NextAuthConfig

export const { handlers, signIn, signOut, auth } = NextAuth(authOptions)
