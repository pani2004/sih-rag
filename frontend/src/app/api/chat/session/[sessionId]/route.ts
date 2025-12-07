import { NextRequest, NextResponse } from 'next/server';

// In-memory storage for session results (in production, use Redis or database)
const sessionResults = new Map<string, {
  conversationId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  response?: string;
  citations?: any[];
  conversationHistory?: any[];
  error?: string;
  timestamp: number;
}>();

// Cleanup old results after 1 hour
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of sessionResults.entries()) {
    if (now - value.timestamp > 3600000) {
      sessionResults.delete(key);
    }
  }
}, 300000); // Check every 5 minutes

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    const result = sessionResults.get(sessionId);

    if (!result) {
      return NextResponse.json({
        status: 'pending',
        sessionId,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error getting session status:', error);
    return NextResponse.json(
      { error: 'Failed to get session status' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const body = await request.json();

    sessionResults.set(sessionId, {
      ...body,
      timestamp: Date.now(),
    });

    return NextResponse.json({ success: true, sessionId });
  } catch (error) {
    console.error('Error updating session status:', error);
    return NextResponse.json(
      { error: 'Failed to update session status' },
      { status: 500 }
    );
  }
}
