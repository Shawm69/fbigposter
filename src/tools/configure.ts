import { readJSON, writeJSON } from "../storage/files";
import {
  getWorkspaceRoot,
  constitutionPath,
  soulPath,
  tacticsPath,
  statusPath,
  Pipeline,
} from "../storage/paths";
import { getNestedValue, setNestedValue } from "../tiers/soul";
import * as path from "path";

interface ConfigureParams {
  section: "config" | "soul" | "constitution" | "tactics" | "status";
  path?: string;
  value: any;
  pipeline?: string;
  reason?: string;
}

export interface ConfigureResult {
  success: boolean;
  section: string;
  path: string | undefined;
  previous_value: any;
  new_value: any;
  error?: string;
}

export function configureTool(params: ConfigureParams): ConfigureResult {
  const { section, path: dotPath, value, pipeline, reason } = params;

  try {
    switch (section) {
      case "config":
        return configureConfig(dotPath, value);
      case "soul":
        return configureSoul(dotPath, value, reason);
      case "constitution":
        return configureConstitution(dotPath, value);
      case "tactics":
        return configureTactics(dotPath, value, pipeline);
      case "status":
        return configureStatus(dotPath, value);
      default:
        return {
          success: false,
          section,
          path: dotPath,
          previous_value: undefined,
          new_value: value,
          error: `Unknown section: ${section}`,
        };
    }
  } catch (err: any) {
    return {
      success: false,
      section,
      path: dotPath,
      previous_value: undefined,
      new_value: value,
      error: err.message,
    };
  }
}

function configureConfig(dotPath: string | undefined, value: any): ConfigureResult {
  const filePath = path.join(getWorkspaceRoot(), "config.json");
  const data = readJSON<any>(filePath) || {};
  const previous = dotPath ? getNestedValue(data, dotPath) : undefined;

  if (dotPath) {
    setNestedValue(data, dotPath, value);
  } else {
    Object.assign(data, value);
  }

  writeJSON(filePath, data);

  return {
    success: true,
    section: "config",
    path: dotPath,
    previous_value: previous,
    new_value: value,
  };
}

function configureSoul(dotPath: string | undefined, value: any, reason?: string): ConfigureResult {
  const filePath = soulPath();
  const data = readJSON<any>(filePath);
  if (!data) {
    throw new Error("Soul file not found. Run smi_init first.");
  }

  const previous = dotPath ? getNestedValue(data, dotPath) : undefined;

  if (dotPath) {
    setNestedValue(data, dotPath, value);
  } else {
    Object.assign(data, value);
  }

  // Increment version and update timestamp
  data.version = (data.version || 0) + 1;
  data.last_modified = new Date().toISOString();

  // Append to change log
  if (!data.change_log) data.change_log = [];
  data.change_log.push({
    date: new Date().toISOString(),
    field: dotPath || "(root)",
    old_value: previous,
    new_value: value,
    reason: reason || "Setup wizard configuration",
  });

  // Remove _template flag if present
  if (data._template) {
    delete data._template;
  }

  writeJSON(filePath, data);

  return {
    success: true,
    section: "soul",
    path: dotPath,
    previous_value: previous,
    new_value: value,
  };
}

function configureConstitution(dotPath: string | undefined, value: any): ConfigureResult {
  const filePath = constitutionPath();
  const data = readJSON<any>(filePath);
  if (!data) {
    throw new Error("Constitution file not found. Run smi_init first.");
  }

  const previous = dotPath ? getNestedValue(data, dotPath) : undefined;

  if (dotPath) {
    setNestedValue(data, dotPath, value);
  } else {
    Object.assign(data, value);
  }

  // Remove _template flag if present
  if (data._template) {
    delete data._template;
  }

  writeJSON(filePath, data);

  return {
    success: true,
    section: "constitution",
    path: dotPath,
    previous_value: previous,
    new_value: value,
  };
}

function configureTactics(
  dotPath: string | undefined,
  value: any,
  pipeline?: string
): ConfigureResult {
  if (!pipeline) {
    throw new Error("pipeline parameter is required for tactics section");
  }

  const validPipelines = ["reels", "image_posts", "stories"];
  if (!validPipelines.includes(pipeline)) {
    throw new Error(`Invalid pipeline: ${pipeline}. Must be one of: ${validPipelines.join(", ")}`);
  }

  const filePath = tacticsPath(pipeline as Pipeline);
  const data = readJSON<any>(filePath);
  if (!data) {
    throw new Error(`Tactics file not found for pipeline: ${pipeline}. Run smi_init first.`);
  }

  const previous = dotPath ? getNestedValue(data, dotPath) : undefined;

  if (dotPath) {
    setNestedValue(data, dotPath, value);
  } else {
    Object.assign(data, value);
  }

  // Remove _template flag if present
  if (data._template) {
    delete data._template;
  }

  writeJSON(filePath, data);

  return {
    success: true,
    section: "tactics",
    path: dotPath,
    previous_value: previous,
    new_value: value,
  };
}

function configureStatus(dotPath: string | undefined, value: any): ConfigureResult {
  const filePath = statusPath();
  const data = readJSON<any>(filePath) || {};
  const previous = dotPath ? getNestedValue(data, dotPath) : undefined;

  if (dotPath) {
    setNestedValue(data, dotPath, value);
  } else {
    Object.assign(data, value);
  }

  writeJSON(filePath, data);

  return {
    success: true,
    section: "status",
    path: dotPath,
    previous_value: previous,
    new_value: value,
  };
}
