import { NextRequest, NextResponse } from 'next/server';
import { createOrUpdateUser, deleteUser } from '@/lib/services/user-service';

interface WebhookEvent {
  type: string;
  data: {
    id: string;
    email_addresses?: { email_address: string }[];
    first_name?: string;
    last_name?: string;
  };
}

export async function POST(req: NextRequest) {
  try {
    const event = (await req.json()) as WebhookEvent;
    const { type, data } = event;

    switch (type) {
      case 'user.created':
      case 'user.updated': {
        const email = data.email_addresses?.[0]?.email_address;
        if (!email) break;
        const name = [data.first_name, data.last_name].filter(Boolean).join(' ') || undefined;
        await createOrUpdateUser(data.id, email, name);
        break;
      }
      case 'user.deleted': {
        await deleteUser(data.id);
        break;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 });
  }
}
