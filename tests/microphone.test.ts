import test from "node:test";
import assert from "node:assert/strict";
import { MicrophoneAccess } from "../client/microphone.ts";

function recordingStream() {
  let stopped = 0;
  return {
    getTracks: () => [
      {
        stop: () => {
          stopped += 1;
        },
      },
    ],
    stopped: () => stopped,
  };
}

test("leaving while microphone permission is pending closes the eventual stream", async () => {
  const microphone = new MicrophoneAccess<ReturnType<typeof recordingStream>>();
  const permission =
    Promise.withResolvers<ReturnType<typeof recordingStream>>();
  const pending = microphone.acquire(() => permission.promise);
  microphone.release();
  const stream = recordingStream();
  permission.resolve(stream);
  assert.equal(await pending, null);
  assert.equal(stream.stopped(), 1);
});
test("a newer recording request owns the microphone and stale permission never becomes active", async () => {
  const microphone = new MicrophoneAccess<ReturnType<typeof recordingStream>>();
  const oldPermission =
    Promise.withResolvers<ReturnType<typeof recordingStream>>();
  const first = microphone.acquire(() => oldPermission.promise);
  const current = recordingStream();
  assert.equal(
    await microphone.acquire(() => Promise.resolve(current)),
    current,
  );
  const stale = recordingStream();
  oldPermission.resolve(stale);
  assert.equal(await first, null);
  assert.equal(stale.stopped(), 1);
  assert.equal(current.stopped(), 0);
  microphone.release();
  assert.equal(current.stopped(), 1);
});
test("an older permission rejection does not close a newer active recording", async () => {
  const microphone = new MicrophoneAccess<ReturnType<typeof recordingStream>>();
  const oldPermission =
    Promise.withResolvers<ReturnType<typeof recordingStream>>();
  const first = microphone.acquire(() => oldPermission.promise);
  const current = recordingStream();
  await microphone.acquire(() => Promise.resolve(current));
  oldPermission.reject(
    new Error("Permission declined for the superseded request."),
  );
  assert.equal(await first, null);
  assert.equal(current.stopped(), 0);
  microphone.release();
  assert.equal(current.stopped(), 1);
});
