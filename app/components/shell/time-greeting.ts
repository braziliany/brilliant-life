export function getTimeGreeting(value = new Date()) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(value);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  if (hour < 6) return "凌晨";
  if (hour < 11) return "早上";
  if (hour < 14) return "中午";
  if (hour < 18) return "下午";
  return "晚上";
}
