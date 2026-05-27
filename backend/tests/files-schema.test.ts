// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';

import { validateUploadFile } from '../src/modules/files/files.schema.ts';

test('validateUploadFile accepts common server-web media types allowed by frontend pickers', () => {
  const acceptedFiles = [
    { originalname: 'vector.svg', mimetype: 'image/svg+xml' },
    { originalname: 'clip.m4v', mimetype: 'video/x-m4v' },
    { originalname: 'voice.m4a', mimetype: 'audio/mp4' },
    { originalname: 'sound.ogg', mimetype: 'audio/ogg' },
  ];

  for (const file of acceptedFiles) {
    assert.equal(validateUploadFile(file), file);
  }
});

test('validateUploadFile still rejects unsupported file types', () => {
  assert.throws(
    () => validateUploadFile({ originalname: 'document.pdf', mimetype: 'application/pdf' }),
    { code: 'UPLOAD_FAILED' },
  );
});
