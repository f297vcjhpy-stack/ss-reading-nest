import { registerGomoku } from "../games/register-gomoku.js";
import { registerTimeTools } from "./time-tools.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { READING_NEST_APP_VERSION } from "@ss/shared";
import type { ReadingRepository } from "../repositories/reading-repository.js";
import { ReadingService } from "../services/reading-service.js";
import type { CloudSourceService } from "../services/cloud-source-service.js";
import {
  registerReadingCompatibilityProbeResource,
  registerReadingResource
} from "./register-resource.js";
import { registerReadingTools } from "./register-tools.js";

export function createMcpServerFromRepository(
  repository: ReadingRepository,
  widgetHtml: string,
  cloudSourceService?: CloudSourceService,
  options: { sourceEndpointBase?: string; workerOrigin?: string; lightweightSchemas?: boolean; gameDatabase?: D1Database } = {}
) {
  const server = new McpServer({
    name: "圆圆和安安的小书房",
    version: READING_NEST_APP_VERSION
  });
  registerTimeTools(server);
  if (options.gameDatabase) registerGomoku(server, options.gameDatabase, widgetHtml, options.workerOrigin);
  const service = new ReadingService(repository);
  registerReadingResource(server, widgetHtml, options.workerOrigin, async () => ({
    ...(options.sourceEndpointBase ? { sourceEndpointBase: options.sourceEndpointBase } : {})
  }));
  registerReadingCompatibilityProbeResource(server, options.workerOrigin);
  registerReadingTools(server, service, cloudSourceService, options);
  return server;
}
