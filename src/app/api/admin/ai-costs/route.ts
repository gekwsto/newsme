import { auth } from '@/lib/auth';
import { getMonthlyAiCosts } from '@/lib/monitoring/events';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const costs = await getMonthlyAiCosts();
  return Response.json(costs);
}
