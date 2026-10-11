import NextAuth from 'next-auth'
import type { NextAuthConfig } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

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
    return { id: user.id, email: user.email, name: user.name }
  },
})

export const authOptions = {
  providers: [credentialsProvider],
  session: { strategy: 'jwt' as const },
  callbacks: {
    jwt: async ({ token, user }: any) => {
      if (user) token.id = (user as any).id
      return token
    },
    session: async ({ session, token }: any) => {
      if (session.user) session.user.id = token.id as string
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
} satisfies NextAuthConfig

export const { handlers, signIn, signOut, auth } = NextAuth(authOptions)
