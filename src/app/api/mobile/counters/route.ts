import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { visits } from "@/db/schema";
import { fetchCountersList } from "@/lib/counters/list";
import { istDayBounds } from "@/lib/date";
import { createCounter } from "@/lib/field/actions";
import { requireIsr } from "@/lib/mobile/auth";
import { newCounterInputFromBody } from "@/lib/mobile/new-counter";

/**
 * Add a counter — the website's own `createCounter`, so the started-day gate,
 * own-stockist rule, no Wholesale from the field, area-belongs-to-stockist,
 * unique mobile and required GPS all match.
 *
 * Body: { name, phone, address, stockistId, areaId, type, typeOther, gps: "lat, lng" }
 * → 201 { counterId } | 400 { error }
 */
export async function POST(request: Request) {
  const auth = await requireIsr();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const result = await createCounter(newCounterInputFromBody(body));
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ counterId: result.counterId }, { status: 201 });
}

/**
 * All Counters — one page of the ISR's stockist's counters, via the same
 * `fetchCountersList` the website's `/field/counters` uses (search, area
 * filter and paging all happen in SQL). Scoping and the "visited today" flag
 * mirror that page.
 *
 * GET ?q=&area=&page= → CountersListPage rows + canVisit / visitedToday
 */
export async function GET(request: Request) {
  const auth = await requireIsr();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const isAdmin = user.accessRoles.includes("admin");
  if (!isAdmin && !user.depot) {
    return Response.json({
      assigned: false,
      message: "You aren't assigned to a stockist yet — ask your Sales Officer to map you to one.",
    });
  }

  const search = new URL(request.url).searchParams;
  const { start, end } = istDayBounds();

  const [list, seen] = await Promise.all([
    fetchCountersList({
      scopeStockistIds: user.depot ? [user.depot.id] : null,
      params: {
        q: search.get("q") ?? undefined,
        area: search.get("area") ?? undefined,
        page: search.get("page") ?? undefined,
      },
    }),
    isAdmin
      ? Promise.resolve([] as { counterId: string }[])
      : db
          .select({ counterId: visits.counterId })
          .from(visits)
          .where(and(eq(visits.userId, user.id), gte(visits.visitedAt, start), lt(visits.visitedAt, end))),
  ]);
  const visitedToday = new Set(seen.map((v) => v.counterId));

  return Response.json({
    assigned: true,
    scope: user.depot?.name ?? "All stockists",
    ...list,
    rows: list.rows.map((c) => ({
      ...c,
      canVisit: isAdmin || c.stockistId === user.depot?.id,
      visitedToday: visitedToday.has(c.id),
    })),
  });
}
