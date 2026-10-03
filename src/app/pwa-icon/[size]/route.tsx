import { ImageResponse } from "next/og";

// App icon for the home screen / notifications, drawn on the fly (no binary assets).
const SIZES = new Set([96, 180, 192, 512]);

export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }) {
  const size = Number((await ctx.params).size);
  if (!SIZES.has(size)) return new Response("not found", { status: 404 });
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(140deg, #0b1220 0%, #10335a 100%)",
          color: "white",
          fontSize: size * 0.3,
          fontWeight: 800,
          letterSpacing: -size * 0.01,
        }}
      >
        OCP
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800" } },
  );
}
