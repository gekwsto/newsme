import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

type ExportFormat = 'openai' | 'sharegpt' | 'alpaca';
type ExportQuality = 'all' | 'published' | 'published_clean';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const format = (searchParams.get('format') ?? 'openai') as ExportFormat;
  const quality = (searchParams.get('quality') ?? 'published') as ExportQuality;

  const where: Record<string, unknown> = { includeInExport: true };
  if (quality === 'published') where.wasPublished = true;
  if (quality === 'published_clean') {
    where.wasPublished = true;
    where.wasEdited = false;
  }

  const examples = await prisma.trainingExample.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    select: {
      systemPrompt: true,
      userPrompt: true,
      aiCompletion: true,
      dataType: true,
      model: true,
      category: true,
    },
  });

  if (examples.length === 0) {
    return NextResponse.json({ error: 'No training examples found for the given filters' }, { status: 404 });
  }

  let output: string;
  let ext: string;
  let contentType: string;

  if (format === 'openai') {
    // OpenAI fine-tuning JSONL format
    const lines = examples.map((ex) =>
      JSON.stringify({
        messages: [
          { role: 'system', content: ex.systemPrompt },
          { role: 'user', content: ex.userPrompt },
          { role: 'assistant', content: ex.aiCompletion },
        ],
      })
    );
    output = lines.join('\n');
    ext = 'jsonl';
    contentType = 'application/jsonl';
  } else if (format === 'sharegpt') {
    // ShareGPT / Axolotl format (works with LLaMA-Factory, Axolotl, unsloth)
    const lines = examples.map((ex) =>
      JSON.stringify({
        conversations: [
          { from: 'system', value: ex.systemPrompt },
          { from: 'human', value: ex.userPrompt },
          { from: 'gpt', value: ex.aiCompletion },
        ],
      })
    );
    output = lines.join('\n');
    ext = 'jsonl';
    contentType = 'application/jsonl';
  } else {
    // Alpaca format (Stanford Alpaca, unsloth LoRA)
    const data = examples.map((ex) => ({
      instruction: ex.systemPrompt,
      input: ex.userPrompt,
      output: ex.aiCompletion,
    }));
    output = JSON.stringify(data, null, 2);
    ext = 'json';
    contentType = 'application/json';
  }

  const date = new Date().toISOString().slice(0, 10);
  const filename = `aisxoliasmos-training-${format}-${quality}-${date}-${examples.length}ex.${ext}`;

  return new NextResponse(output, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Training-Examples': String(examples.length),
    },
  });
}
