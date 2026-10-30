import { mkdir } from "node:fs/promises";

// Small standards-compliant ZIP (stored entries). No shell, archive dependency, or package cache.
function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function zip(
  entries: Array<{ name: string; data: Uint8Array }>,
): Uint8Array {
  const local: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const filename = Buffer.from(name),
      crc = crc32(data),
      header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(33, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, Buffer.from(data));
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(33, 14);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(data.length, 20);
    record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(filename.length, 28);
    record.writeUInt32LE(offset, 42);
    central.push(record, filename);
    offset += header.length + filename.length + data.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

if (import.meta.main) {
  const helper = await Bun.build({
    entrypoints: ["skill/squeek-mode/scripts/squeek.ts"],
    target: "bun",
    minify: false,
  });
  const host = await Bun.build({
    entrypoints: ["integrations/local-agent-host.ts"],
    target: "bun",
    minify: false,
  });
  if (!helper.success || !host.success)
    throw new Error("Skill bundling failed");
  await mkdir("skill/squeek-mode/integrations", { recursive: true });
  await Bun.write("skill/squeek-mode/scripts/squeek.mjs", helper.outputs[0]);
  await Bun.write(
    "skill/squeek-mode/integrations/local-agent-host.mjs",
    host.outputs[0],
  );
  const paths = [
    "SKILL.md",
    "INSTALL.md",
    "scripts/squeek.mjs",
    "integrations/local-agent-host.mjs",
  ];
  const entries = await Promise.all(
    paths.map(async (name) => ({
      name,
      data: new Uint8Array(
        await Bun.file(`skill/squeek-mode/${name}`).arrayBuffer(),
      ),
    })),
  );
  await Bun.write("dist/squeek-mode-skill.zip", zip(entries));
  process.stdout.write(
    `Portable skill: ${paths.length} files, ${Bun.file("dist/squeek-mode-skill.zip").size} bytes\n`,
  );
}
