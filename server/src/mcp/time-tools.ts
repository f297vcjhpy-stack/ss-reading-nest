import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function calendarDistance(date: string, today: string) {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("日期格式应为 YYYY-MM-DD");
    const ms = Date.parse(value + "T00:00:00Z");
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) throw new Error("日期无效");
    return ms;
  };
  return Math.round((parse(today) - parse(date)) / 86400000);
}

export function registerTimeTools(server: McpServer) {
  const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });
  server.registerTool("an_current_time", {
    description: "查询真实当前日期、时间、星期。默认北京时间；仅调用时查询，不会后台唤醒或主动发送消息。",
    inputSchema: { timezone: z.string().default("Asia/Shanghai") },
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async ({ timezone }) => {
    try {
      const now = new Date();
      return text({ timezone, local: new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, dateStyle: "full", timeStyle: "long" }).format(now), utc: now.toISOString() });
    } catch { return { ...text({ error: "无效时区，请使用 Asia/Shanghai 等 IANA 时区" }), isError: true }; }
  });
  server.registerTool("an_days_since", {
    description: "计算给定日期距今天的日历天数。同一天为0，负数表示还未到达。日期只在本次计算中使用，不保存。",
    inputSchema: { date: z.string(), timezone: z.string().default("Asia/Shanghai") },
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async ({ date, timezone }) => {
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
      const get = (type: string) => parts.find(p => p.type === type)!.value;
      const today = `${get("year")}-${get("month")}-${get("day")}`;
      return text({ date, today, timezone, elapsedCalendarDays: calendarDistance(date, today) });
    } catch { return { ...text({ error: "请检查日期和时区" }), isError: true }; }
  });
}
