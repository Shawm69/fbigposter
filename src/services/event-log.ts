import { v4 as uuidv4 } from "uuid";
import { appendJSONL, readJSONL } from "../storage/files";
import { eventsLogPath } from "../storage/paths";

export type SMIEventType =
  | "post_published"
  | "post_failed"
  | "analysis_complete"
  | "analysis_error"
  | "content_plan_created"
  | "token_warning"
  | "service_started"
  | "error";

export interface SMIEvent {
  id: string;
  timestamp: string;
  type: SMIEventType;
  pipeline?: string;
  summary: string;
  details?: any;
  read: boolean;
}

const MAX_BUFFER_SIZE = 100;
let eventBuffer: SMIEvent[] = [];
let initialized = false;

/**
 * Load existing events from JSONL on first access.
 */
function ensureLoaded(): void {
  if (initialized) return;
  initialized = true;
  try {
    const stored = readJSONL<SMIEvent>(eventsLogPath());
    // Keep only the last MAX_BUFFER_SIZE events
    eventBuffer = stored.slice(-MAX_BUFFER_SIZE);
  } catch {
    eventBuffer = [];
  }
}

/**
 * Log a background event. Appends to in-memory ring buffer and persists to JSONL.
 */
export function logEvent(partial: {
  type: SMIEventType;
  pipeline?: string;
  summary: string;
  details?: any;
}): void {
  ensureLoaded();

  const event: SMIEvent = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    type: partial.type,
    pipeline: partial.pipeline,
    summary: partial.summary,
    details: partial.details,
    read: false,
  };

  eventBuffer.push(event);

  // Trim ring buffer
  if (eventBuffer.length > MAX_BUFFER_SIZE) {
    eventBuffer = eventBuffer.slice(-MAX_BUFFER_SIZE);
  }

  // Persist to JSONL
  try {
    appendJSONL(eventsLogPath(), event);
  } catch {
    // Non-fatal — event is still in memory
  }
}

/**
 * Get all unread events and mark them as read.
 */
export function getUnreadEvents(): SMIEvent[] {
  ensureLoaded();

  const unread = eventBuffer.filter((e) => !e.read);
  for (const e of unread) {
    e.read = true;
  }
  return unread;
}

/**
 * Get the most recent N events (regardless of read status).
 */
export function getRecentEvents(limit: number = 20): SMIEvent[] {
  ensureLoaded();
  return eventBuffer.slice(-limit);
}
