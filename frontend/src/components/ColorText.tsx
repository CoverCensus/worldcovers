/** Render the stored display color on a readable background in either theme. */
export function ColorText({ name, hex }: { name: string; hex?: string }) {
  if (!name.trim() || name === "-" || !hex || !/^#[0-9a-f]{6}$/i.test(hex)) {
    return <span className="font-bold">{name}</span>;
  }

  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  // Pick black or white without changing the stored color or its name.
  const backgroundColor = luminance > 0.179 ? "#000000" : "#FFFFFF";

  return (
    <span className="rounded px-1 font-bold" style={{ color: hex, backgroundColor }}>
      {name}
    </span>
  );
}
