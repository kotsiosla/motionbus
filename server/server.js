import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 5174;
const GTFS_RT_URL = process.env.FEED_URL || "http://20.19.98.194:8328/Api/api/gtfs-realtime";

app.use(cors());

app.get("/gtfsrt/vehicle-positions", async (_req, res) => {
  try {
    const upstream = await fetch(GTFS_RT_URL, {
      headers: {
        "User-Agent": "motionbus-gtfs-proxy"
      }
    });

    if (!upstream.ok) {
      res.status(502).json({
        error: "Failed to fetch GTFS-RT feed",
        status: upstream.status,
      });
      return;
    }

    const data = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", "application/x-protobuf");
    res.setHeader("Cache-Control", "no-store");
    res.send(data);
  } catch (error) {
    res.status(500).json({
      error: "Proxy error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`GTFS-RT proxy listening on http://localhost:${PORT}`);
});
