// Independent validators only. FFmpeg outputs only null or a bounded SHA-256
// digest; never writes a converted media file or substitutes for the browser.
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
const tsv = 'name\tnote\tcount\r\nalpha\t"comma, quote ""and"" newline\ninside"\t2\r\nβeta\tUnicode survives\t3\r\n';
const ebook = "Chapter One\nWithin EPUB keeps files on this device.\nFormatting stays readable. Linked text.\n" +
  "Inline, punctuation stays attached.\n- First item\n- Second item\nCell A\tCell B\nUnicode: हिन्दी, 日本語, café, 😀.\n" +
  "Chapter Two\nLine one\nafter break\nCopyright © registered ®.\n";
const archive = String.raw`
import hashlib,json,sys,tarfile,zipfile
def digest(f):
 h=hashlib.sha256();n=0
 while b:=f.read(65536):
  h.update(b);n+=len(b);assert n<=2097152
 return n,h.hexdigest()
def name(s):
 assert 0<len(s)<=256 and chr(92) not in s and not s.startswith('/') and all(p not in ['','.','..'] for p in s.split('/'))
 return s
expected={};total=0
with tarfile.open(sys.argv[1],'r|*') as t:
 for entry in t:
  if entry.isdir():continue
  assert entry.isfile() and len(expected)<64 and name(entry.name) not in expected
  with t.extractfile(entry) as f: expected[entry.name]=digest(f)
  total+=expected[entry.name][0];assert total<=2097152
actual={};total=0
with zipfile.ZipFile(sys.argv[2]) as z:
 assert len(z.infolist())<=64
 for entry in z.infolist():
  if entry.is_dir():continue
  assert name(entry.filename) not in actual and entry.file_size<=2097152
  with z.open(entry) as f:actual[entry.filename]=digest(f)
  total+=actual[entry.filename][0];assert total<=2097152
assert actual==expected and len(actual)>0
print(json.dumps({'entries':len(actual),'payloadBytes':total,'allEntryNamesSizesAndSha256Equal':True,'validator':'independent streaming Python tarfile/zipfile, every entry CRC and SHA-256'}))`;
const docx = String.raw`
import json,sys,zipfile,xml.etree.ElementTree as ET
word='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
rels='http://schemas.openxmlformats.org/package/2006/relationships'
types='http://schemas.openxmlformats.org/package/2006/content-types'
with open(sys.argv[1],'rb') as f:
 text=f.read(65537);assert len(text)<=65536
expected=text.decode('utf-8').splitlines()
with zipfile.ZipFile(sys.argv[2]) as z:
 assert len(z.infolist())<=32 and sum(x.file_size for x in z.infolist())<=2097152 and z.testzip() is None
 def part(name):
  with z.open(name) as f:b=f.read(65537)
  assert len(b)<=65536 and b'<!DOCTYPE' not in b and b'<!ENTITY' not in b
  return ET.fromstring(b)
 ct=part('[Content_Types].xml');assert ct.tag=='{'+types+'}Types'
 assert any(e.get('PartName')=='/word/document.xml' and e.get('ContentType')=='application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml' for e in ct)
 r=part('_rels/.rels');assert r.tag=='{'+rels+'}Relationships'
 assert any(e.get('Target')=='word/document.xml' and e.get('Type')=='http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument' for e in r)
 d=part('word/document.xml');assert d.tag=='{'+word+'}document'
 paragraphs=[''.join(t.text or '' for t in p.findall('.//{'+word+'}t')) for p in d.findall('.//{'+word+'}p')]
 assert paragraphs==expected or paragraphs==expected+['']
print(json.dumps({'paragraphs':len(paragraphs),'unicodeTextAndOrderVerified':True,'zipCrcVerified':True,'packageTypesAndMainRelationshipVerified':True,'validator':'independent Python zipfile and bounded XML parsing'}))`;

export async function validateInstalledCompatibilityOutput(profileId, source, file, execute) {
  const text = async () => { assert.ok((await stat(file)).size <= 12288); return new TextDecoder("utf-8", { fatal: true }).decode(await readFile(file)); };
  const native = async (tool, args) => await execute(tool, args);
  const probe = async target => JSON.parse((await native("ffprobe", ["-v", "error", "-show_entries",
    "stream=codec_name,codec_type,width,height,sample_rate,channels:format=duration", "-of", "json", target])).stdout);
  const decode = target => native("ffmpeg", ["-hide_banner", "-v", "error", "-xerror", "-threads", "1", "-i", target, "-f", "null", "-"]);
  const streamHash = async (target, stream, codec) => {
    const value = (await native("ffmpeg", ["-hide_banner", "-v", "error", "-xerror", "-threads", "1", "-i", target,
      "-map", `0:${stream}`, "-c", codec, "-f", "hash", "-hash", "sha256", "-"])).stdout.trim();
    assert.match(value, /^SHA256=[0-9a-f]{64}$/); return value.slice(7);
  };
  switch (profileId) {
    case "csv-to-tsv": assert.equal(await text(), tsv); return { validator: "exact expected UTF-8 TSV quoting, rows and Unicode bytes" };
    case "epub-to-txt": assert.equal(await text(), ebook); return { validator: "exact independent EPUB reading-order text, Unicode, lists, table cells and exclusions" };
    case "srt-to-vtt": {
      const blocks = (await text()).replaceAll("\r\n", "\n").trimEnd().split("\n\n");
      assert.equal(blocks.shift(), "WEBVTT"); assert.equal(blocks.length, 2);
      const expected = [["00:00:01.250 --> 00:00:03.900", "<i>Hello</i> from Within."],
        ["00:00:04.100 --> 00:00:07.000", "Second cue", "with two lines."]];
      for (let i = 0; i < blocks.length; i++) {
        const lines = blocks[i].split("\n"); if (/^\d+$/.test(lines[0])) assert.equal(lines.shift(), String(i + 1));
        assert.deepEqual(lines, expected[i]);
      }
      return { validator: "independent WebVTT cue parse: exact two intervals, italics and multiline content", cues: 2 };
    }
    case "tar-to-zip": return JSON.parse((await native("python", ["-c", archive, source, file])).stdout);
    case "txt-to-docx": return JSON.parse((await native("python", ["-c", docx, source, file])).stdout);
    case "wav-to-flac": {
      const p = await probe(file); assert.equal(p.streams.length, 1);
      assert.equal(p.streams[0].codec_name, "flac"); assert.equal(p.streams[0].codec_type, "audio");
      assert.equal(p.streams[0].sample_rate, "44100"); assert.equal(p.streams[0].channels, 1); assert.equal(Number(p.format.duration), 2);
      const pcmSha256 = await streamHash(file, "a:0", "pcm_s16le"); assert.equal(pcmSha256, await streamHash(source, "a:0", "pcm_s16le"));
      return { validator: "FFprobe FLAC structure and exact full decoded PCM SHA-256", pcmSha256, sampleRate: 44100, channels: 1, durationSeconds: 2, genuineReencode: true };
    }
    case "png-to-webp": {
      const p = await probe(file); assert.equal(p.streams.length, 1);
      assert.deepEqual(p.streams[0], { codec_name: "webp", codec_type: "video", width: 1024, height: 768 }); await decode(file);
      const { stderr } = await native("ffmpeg", ["-v", "info", "-threads", "1", "-i", source, "-threads", "1", "-i", file,
        "-filter_complex_threads", "1", "-lavfi", "[0:v:0]format=rgb24[reference];[1:v:0]format=rgb24[converted];[reference][converted]ssim", "-f", "null", "-"]);
      const ssim = Number(stderr.match(/SSIM[^\r\n]*All:([0-9.]+)/)?.[1]); assert.ok(Number.isFinite(ssim) && ssim >= .9);
      return { validator: "FFprobe codec/dimensions, full native decode and independent SSIM", width: 1024, height: 768, ssim };
    }
    case "mkv-to-mp4": {
      const p = await probe(file); assert.deepEqual(p.streams.map(s => s.codec_name), ["h264", "aac"]);
      const duration = Number(p.format.duration); assert.ok(duration > 3.9 && duration < 4.2);
      const videoPacketSha256 = await streamHash(file, "v:0", "copy"), audioPacketSha256 = await streamHash(file, "a:0", "copy");
      assert.equal(videoPacketSha256, await streamHash(source, "v:0", "copy")); assert.equal(audioPacketSha256, await streamHash(source, "a:0", "copy"));
      await decode(file);
      return { validator: "FFprobe MP4 streams/duration, exact H.264/AAC packet payload hashes and full native decode",
        duration, videoPacketSha256, audioPacketSha256, streamCopyRemux: true, genuineReencode: false };
    }
    default: throw new Error("Unregistered compatibility validator");
  }
}
