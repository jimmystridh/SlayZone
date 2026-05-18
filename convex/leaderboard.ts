import { v } from 'convex/values'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

const PERIOD_VALUES = v.union(
  v.literal('daily'),
  v.literal('weekly'),
  v.literal('monthly'),
  v.literal('all-time')
)

async function requireIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error('Unauthorized')
  return identity
}

function authUserIdFromSubject(subject: string | undefined): Id<'users'> | null {
  if (!subject) return null
  const [userId] = subject.split('|')
  if (!userId) return null
  return userId as Id<'users'>
}

async function findCurrentUser(
  ctx: QueryCtx | MutationCtx,
  tokenIdentifier: string,
  subject?: string
): Promise<Doc<'users'> | null> {
  const authUserId = authUserIdFromSubject(subject)
  const authUser = authUserId ? await ctx.db.get(authUserId) : null
  if (authUser) return authUser

  return await ctx.db
    .query('users')
    .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', tokenIdentifier))
    .first()
}

async function upsertViewer(ctx: MutationCtx): Promise<Id<'users'>> {
  const identity = await requireIdentity(ctx)
  const profile = identity as Record<string, unknown>
  const now = Date.now()
  const tokenIdentifier = identity.tokenIdentifier
  const githubId = typeof identity.subject === 'string' ? identity.subject : undefined
  const githubLogin =
    typeof profile.nickname === 'string'
      ? profile.nickname
      : typeof profile.preferred_username === 'string'
        ? profile.preferred_username
        : typeof profile.login === 'string'
          ? profile.login
          : undefined
  const name = typeof profile.name === 'string' ? profile.name : undefined
  const image =
    typeof profile.pictureUrl === 'string'
      ? profile.pictureUrl
      : typeof profile.picture === 'string'
        ? profile.picture
        : typeof profile.image === 'string'
          ? profile.image
          : typeof profile.avatar_url === 'string'
            ? profile.avatar_url
            : undefined

  const legacyUser = await ctx.db
    .query('users')
    .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', tokenIdentifier))
    .first()

  const authUserId = authUserIdFromSubject(identity.subject)
  const authUser = authUserId ? await ctx.db.get(authUserId) : null

  if (authUser) {
    await ctx.db.patch(authUser._id, {
      tokenIdentifier,
      githubId: githubId ?? authUser.githubId,
      githubLogin: githubLogin ?? authUser.githubLogin,
      name: name ?? authUser.name,
      image: image ?? authUser.image,
      updatedAt: now
    })

    // Migrate legacy daily stats from older tokenIdentifier-linked user rows.
    if (legacyUser && legacyUser._id !== authUser._id) {
      const legacyStats = await ctx.db
        .query('leaderboardDailyStats')
        .withIndex('by_userId', (q) => q.eq('userId', legacyUser._id))
        .collect()
      for (const stat of legacyStats) {
        await ctx.db.patch(stat._id, { userId: authUser._id, updatedAt: now })
      }
      await ctx.db.delete(legacyUser._id)
    }

    return authUser._id
  }

  if (legacyUser) {
    await ctx.db.patch(legacyUser._id, {
      githubId: githubId ?? legacyUser.githubId,
      githubLogin: githubLogin ?? legacyUser.githubLogin,
      name: name ?? legacyUser.name,
      image: image ?? legacyUser.image,
      updatedAt: now
    })
    return legacyUser._id
  }

  return await ctx.db.insert('users', {
    tokenIdentifier,
    githubId,
    githubLogin,
    name,
    image,
    createdAt: now,
    updatedAt: now
  })
}

function displayNameForUser(user: Doc<'users'>): string {
  return user.githubLogin ?? user.name ?? 'Unknown'
}

function parseGithubNumericId(value: string | null | undefined): string | null {
  if (!value) return null
  return /^\d+$/.test(value) ? value : null
}

export const getMyBestRank = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    const user = await findCurrentUser(ctx, identity.tokenIdentifier, identity.subject)
    if (!user) return null

    const stats = await ctx.db.query('leaderboardDailyStats').collect()

    const tokenTotals = new Map<Id<'users'>, number>()
    const taskTotals = new Map<Id<'users'>, number>()
    for (const s of stats) {
      tokenTotals.set(s.userId, (tokenTotals.get(s.userId) ?? 0) + s.totalTokens)
      taskTotals.set(s.userId, (taskTotals.get(s.userId) ?? 0) + s.totalCompletedTasks)
    }

    const tokenRank = Array.from(tokenTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .findIndex(([id]) => id === user._id)
    const taskRank = Array.from(taskTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .findIndex(([id]) => id === user._id)

    const best = Math.min(
      tokenRank === -1 ? Infinity : tokenRank + 1,
      taskRank === -1 ? Infinity : taskRank + 1
    )
    return best === Infinity ? null : best
  }
})

/** Returns the ISO date cutoff string (YYYY-MM-DD) for a period, or null for all-time. */
function getDateCutoff(period: string): string | null {
  const now = new Date()
  if (period === 'daily') {
    return now.toISOString().slice(0, 10)
  }
  if (period === 'weekly') {
    const d = new Date(now)
    d.setDate(d.getDate() - 6)
    return d.toISOString().slice(0, 10)
  }
  if (period === 'monthly') {
    const d = new Date(now)
    d.setDate(d.getDate() - 29)
    return d.toISOString().slice(0, 10)
  }
  return null
}

export const syncViewerProfile = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await upsertViewer(ctx)
    return { userId }
  }
})

export const syncDailyStats = mutation({
  args: {
    days: v.array(
      v.object({
        date: v.string(),
        totalTokens: v.number(),
        totalCompletedTasks: v.number()
      })
    )
  },
  handler: async (ctx, args) => {
    const userId = await upsertViewer(ctx)
    const now = Date.now()

    for (const day of args.days) {
      if (day.totalTokens < 0 || day.totalCompletedTasks < 0) continue

      const existing = await ctx.db
        .query('leaderboardDailyStats')
        .withIndex('by_userId_and_date', (q) => q.eq('userId', userId).eq('date', day.date))
        .first()

      if (existing) {
        await ctx.db.patch(existing._id, {
          totalTokens: day.totalTokens,
          totalCompletedTasks: day.totalCompletedTasks,
          updatedAt: now
        })
      } else {
        await ctx.db.insert('leaderboardDailyStats', {
          userId,
          date: day.date,
          totalTokens: day.totalTokens,
          totalCompletedTasks: day.totalCompletedTasks,
          updatedAt: now
        })
      }
    }

    return { synced: args.days.length }
  }
})

export const getMyTotals = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx)
    const user = await findCurrentUser(ctx, identity.tokenIdentifier, identity.subject)

    if (!user) {
      return null
    }

    const githubAccount = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) => q.eq('userId', user._id).eq('provider', 'github'))
      .first()

    const githubNumericId =
      parseGithubNumericId(githubAccount?.providerAccountId) ??
      parseGithubNumericId(user.githubId ?? null)

    const stats = await ctx.db
      .query('leaderboardDailyStats')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .collect()

    const totalTokens = stats.reduce((sum, s) => sum + s.totalTokens, 0)
    const totalCompletedTasks = stats.reduce((sum, s) => sum + s.totalCompletedTasks, 0)
    const lastUpdated = stats.reduce((max, s) => Math.max(max, s.updatedAt), 0)

    return {
      user: {
        id: user._id,
        githubId: user.githubId ?? null,
        githubNumericId,
        githubLogin: user.githubLogin ?? null,
        name: user.name ?? null,
        image: user.image ?? null
      },
      totals: stats.length > 0 ? { totalTokens, totalCompletedTasks, updatedAt: lastUpdated } : null
    }
  }
})

export const forgetMe = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx)
    const user = await findCurrentUser(ctx, identity.tokenIdentifier, identity.subject)

    if (!user) {
      return { deleted: false, reason: 'user-not-found' as const }
    }

    const stats = await ctx.db
      .query('leaderboardDailyStats')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .collect()

    const sessions = await ctx.db
      .query('authSessions')
      .withIndex('userId', (q) => q.eq('userId', user._id))
      .collect()

    const accounts = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) => q.eq('userId', user._id))
      .collect()

    for (const stat of stats) {
      await ctx.db.delete(stat._id)
    }

    let deletedVerificationCodes = 0
    for (const account of accounts) {
      const verificationCodes = await ctx.db
        .query('authVerificationCodes')
        .withIndex('accountId', (q) => q.eq('accountId', account._id))
        .collect()
      for (const code of verificationCodes) {
        await ctx.db.delete(code._id)
        deletedVerificationCodes += 1
      }
      await ctx.db.delete(account._id)
    }

    let deletedRefreshTokens = 0
    for (const session of sessions) {
      const refreshTokens = await ctx.db
        .query('authRefreshTokens')
        .withIndex('sessionId', (q) => q.eq('sessionId', session._id))
        .collect()
      for (const token of refreshTokens) {
        await ctx.db.delete(token._id)
        deletedRefreshTokens += 1
      }
      await ctx.db.delete(session._id)
    }

    await ctx.db.delete(user._id)

    return {
      deleted: true,
      deletedDailyStats: stats.length,
      deletedAccounts: accounts.length,
      deletedSessions: sessions.length,
      deletedVerificationCodes,
      deletedRefreshTokens
    }
  }
})

async function getViewerUserId(ctx: QueryCtx): Promise<Id<'users'> | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null
  const user = await findCurrentUser(ctx, identity.tokenIdentifier, identity.subject)
  return user?._id ?? null
}

export const topByTotalTokens = query({
  args: {
    limit: v.optional(v.number()),
    period: v.optional(PERIOD_VALUES)
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100)
    const cutoff = getDateCutoff(args.period ?? 'all-time')

    const stats = cutoff
      ? await ctx.db
          .query('leaderboardDailyStats')
          .withIndex('by_date', (q) => q.gte('date', cutoff))
          .collect()
      : await ctx.db.query('leaderboardDailyStats').collect()

    const userTotals = new Map<Id<'users'>, number>()
    for (const s of stats) {
      userTotals.set(s.userId, (userTotals.get(s.userId) ?? 0) + s.totalTokens)
    }

    const allEntries = (
      await Promise.all(
        Array.from(userTotals.entries()).map(async ([userId, totalTokens]) => {
          const user = await ctx.db.get(userId)
          return {
            userId,
            displayName: user ? displayNameForUser(user) : 'Unknown',
            githubLogin: user?.githubLogin ?? null,
            image: user?.image ?? null,
            totalTokens
          }
        })
      )
    ).sort((a, b) => b.totalTokens - a.totalTokens)

    const viewerUserId = await getViewerUserId(ctx)
    const viewerRank = viewerUserId ? allEntries.findIndex((e) => e.userId === viewerUserId) : -1
    const viewer = viewerRank >= limit ? { ...allEntries[viewerRank], rank: viewerRank + 1 } : null

    return { entries: allEntries.slice(0, limit), viewer }
  }
})

export const topByCompletedTasks = query({
  args: {
    limit: v.optional(v.number()),
    period: v.optional(PERIOD_VALUES)
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100)
    const cutoff = getDateCutoff(args.period ?? 'all-time')

    const stats = cutoff
      ? await ctx.db
          .query('leaderboardDailyStats')
          .withIndex('by_date', (q) => q.gte('date', cutoff))
          .collect()
      : await ctx.db.query('leaderboardDailyStats').collect()

    const userTotals = new Map<Id<'users'>, number>()
    for (const s of stats) {
      userTotals.set(s.userId, (userTotals.get(s.userId) ?? 0) + s.totalCompletedTasks)
    }

    const allEntries = (
      await Promise.all(
        Array.from(userTotals.entries()).map(async ([userId, totalCompletedTasks]) => {
          const user = await ctx.db.get(userId)
          return {
            userId,
            displayName: user ? displayNameForUser(user) : 'Unknown',
            githubLogin: user?.githubLogin ?? null,
            image: user?.image ?? null,
            totalCompletedTasks
          }
        })
      )
    ).sort((a, b) => b.totalCompletedTasks - a.totalCompletedTasks)

    const viewerUserId = await getViewerUserId(ctx)
    const viewerRank = viewerUserId ? allEntries.findIndex((e) => e.userId === viewerUserId) : -1
    const viewer = viewerRank >= limit ? { ...allEntries[viewerRank], rank: viewerRank + 1 } : null

    return { entries: allEntries.slice(0, limit), viewer }
  }
})
