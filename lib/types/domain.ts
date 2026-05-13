export type ActivityItem = {
  type: "labour" | "material" | "machinery" | "expense" | "incident";
  id: string;
  siteId: string;
  createdAt: string;
};
