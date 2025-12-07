import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/lib/inngest/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, conversation_history, sessionId } = body;

    if (!message || !sessionId) {
      return NextResponse.json(
        { error: 'Message and sessionId are required' },
        { status: 400 }
      );
    }

    // Send event to Inngest
    const event = await inngest.send({
      name: 'chat/message.sent',
      data: {
        sessionId,
        message,
        conversationHistory: conversation_history || [],
        useStreaming: false,
      },
    });

    return NextResponse.json({ 
      jobId: event.ids[0],
      status: 'pending',
    });
  } catch (error) {
    console.error('Error sending chat job:', error);
    return NextResponse.json(
      { error: 'Failed to send chat job' },
      { status: 500 }
    );
  }
}
