// SPDX-License-Identifier: AGPL-3.0-or-later
// AGPL: Strong copyleft license requiring source disclosure for network use. See LICENSE file.
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import redisService from "./redis.js";
import walrusService from "./walrus.js";
import logger from "../utils/logger.js";

const QUEUE_KEY = "suioutkit:walrus-uploads";
const POLL_INTERVAL_MS = 5_000;
const MAX_ATTEMPTS = 3;

interface UploadJob {
  nonce: string;
  signedPayload: string;
  attempts: number;
  createdAt: string;
}

class WalrusQueueService {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private processing = false;

  /**
   * Enqueues a Walrus upload job to Redis using the pre-signed payload.
   * Returns immediately. The background worker processes it.
   */
  public async enqueueUpload(nonce: string, signedPayload: string): Promise<void> {
    const job: UploadJob = {
      nonce,
      signedPayload,
      attempts: 0,
      createdAt: new Date().toISOString(),
    };

    const client = redisService.getClient();
    await client.lpush(QUEUE_KEY, JSON.stringify(job));
    logger.info("WALRUS-QUEUE", `Enqueued upload for nonce ${nonce}`);
  }

  /**
   * Starts the background worker that polls the queue and processes uploads.
   * Call once on server boot.
   */
  public startWorker(): void {
    if (this.pollTimer) return;

    logger.info("WALRUS-QUEUE", `Worker started (poll every ${POLL_INTERVAL_MS / 1000}s)`);
    this.pollTimer = setInterval(() => this.processNext(), POLL_INTERVAL_MS);
    // Process immediately on start
    this.processNext();
  }

  /**
   * Stops the background worker gracefully.
   */
  public stopWorker(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      logger.info("WALRUS-QUEUE", "Worker stopped");
    }
  }

  private async processNext(): Promise<void> {
    if (this.processing) return;

    const client = redisService.getClient();
    const raw = await client.rpop(QUEUE_KEY);
    if (!raw) return;

    this.processing = true;
    let job: UploadJob;
    try {
      job = JSON.parse(raw);
    } catch {
      logger.error("WALRUS-QUEUE", "Failed to parse job, discarding");
      this.processing = false;
      return;
    }

    try {
      logger.info("WALRUS-QUEUE", `Processing upload for nonce ${job.nonce} (attempt ${job.attempts + 1}/${MAX_ATTEMPTS})`);
      // Use precomputed signed payload to guarantee deterministic blob ID
      const blobId = await walrusService.uploadInvoice({ nonce: job.nonce } as any, job.signedPayload);
      logger.success("WALRUS-QUEUE", `Upload complete for nonce ${job.nonce}: ${blobId}`);
    } catch (err: any) {
      job.attempts++;
      if (job.attempts < MAX_ATTEMPTS) {
        await client.lpush(QUEUE_KEY, JSON.stringify(job));
        logger.warn("WALRUS-QUEUE", `Upload failed for nonce ${job.nonce}: ${err.message}. Re-enqueued (attempt ${job.attempts}/${MAX_ATTEMPTS})`);
      } else {
        logger.error("WALRUS-QUEUE", `Upload failed for nonce ${job.nonce} after ${MAX_ATTEMPTS} attempts: ${err.message}. Giving up.`);
      }
    } finally {
      this.processing = false;
    }
  }
}

export const walrusQueueService = new WalrusQueueService();
export default walrusQueueService;
