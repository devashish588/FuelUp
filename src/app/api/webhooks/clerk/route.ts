import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { createOrUpdateUser, deleteUser } from '@/lib/services/user-service';
import { serverEnv } from '@/config/env';
import { logger } from '@/lib/logger/logger';

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
  const secret = serverEnv.clerkWebhookSecret;
  if (!secret) {
    logger.error('Clerk webhook called without CLERK_WEBHOOK_SECRET configured', {});
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  let event: WebhookEvent;
  try {
    const payload = await req.text();
    const svixId = req.headers.get('svix-id');
    const svixTimestamp = req.headers.get('svix-timestamp');
    const svixSignature = req.headers.get('svix-signature');
    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json({ error: 'Missing webhook signature' }, { status: 400 });
    }
    const wh = new Webhook(secret);
    event = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as unknown as WebhookEvent;
  } catch (error) {
    logger.warn('Clerk webhook signature verification failed', {});
    void error;
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
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
    logger.error('Clerk webhook handler failed', { type: event.type });
    void error;
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 });
  }
}
