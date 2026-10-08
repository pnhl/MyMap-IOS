'use strict';

const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { onRequest } = require('firebase-functions/v2/https');

initializeApp();

exports.ensureSupabaseRole = onRequest(
  {
    region: 'asia-southeast1',
    cors: true,
    invoker: 'public',
  },
  async (request, response) => {
    if (request.method !== 'POST') {
      response.set('Allow', 'POST').status(405).json({ error: 'method_not_allowed' });
      return;
    }

    const authorization = request.get('authorization') || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      response.status(401).json({ error: 'missing_firebase_token' });
      return;
    }

    try {
      const auth = getAuth();
      const decoded = await auth.verifyIdToken(match[1], true);
      const user = await auth.getUser(decoded.uid);
      if (user.customClaims?.role !== 'authenticated') {
        await auth.setCustomUserClaims(user.uid, {
          ...(user.customClaims || {}),
          role: 'authenticated',
        });
      }
      response.status(204).send('');
    } catch {
      response.status(401).json({ error: 'invalid_firebase_token' });
    }
  },
);
