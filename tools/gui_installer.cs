using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[assembly: AssemblyTitle("Antigravity 简体中文语言助手")]
[assembly: AssemblyDescription("Antigravity 桌面端简体中文语言层安装与维护工具")]
[assembly: AssemblyProduct("Antigravity Zh-CN Helper")]
[assembly: AssemblyCompany("Antigravity Zh-CN Community")]
[assembly: AssemblyCopyright("Copyright (c) 2026 Antigravity Zh-CN")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace AntigravityZhCn
{
    internal static class NativeMethods
    {
        [DllImport("user32.dll")]
        internal static extern bool SetProcessDPIAware();
    }

    internal static class AsarHelper
    {
        private const int BlockSize = 4 * 1024 * 1024;
        private const uint Magic = 4;
        public const string Marker = "require('./zh-cn/main-hook.js')";
        private static readonly string EmptySha256 = Sha256Hex(new byte[0]);

        public static string Sha256Hex(byte[] data)
        {
            using (var sha = SHA256.Create())
            {
                byte[] hash = sha.ComputeHash(data);
                var sb = new StringBuilder(hash.Length * 2);
                for (int i = 0; i < hash.Length; i++) sb.Append(hash[i].ToString("x2"));
                return sb.ToString();
            }
        }

        public static string Sha256File(string path)
        {
            using (var sha = SHA256.Create())
            using (var fs = File.OpenRead(path))
            {
                byte[] hash = sha.ComputeHash(fs);
                var sb = new StringBuilder(hash.Length * 2);
                for (int i = 0; i < hash.Length; i++) sb.Append(hash[i].ToString("x2"));
                return sb.ToString();
            }
        }

        private static Dictionary<string, object> BuildIntegrity(byte[] data)
        {
            var blocks = new List<object>();
            if (data.Length == 0)
            {
                blocks.Add(EmptySha256);
            }
            else
            {
                using (var sha = SHA256.Create())
                {
                    for (int offset = 0; offset < data.Length; offset += BlockSize)
                    {
                        int len = Math.Min(BlockSize, data.Length - offset);
                        byte[] h = sha.ComputeHash(data, offset, len);
                        var sb = new StringBuilder(h.Length * 2);
                        for (int i = 0; i < h.Length; i++) sb.Append(h[i].ToString("x2"));
                        blocks.Add(sb.ToString());
                    }
                }
            }
            var d = new Dictionary<string, object>();
            d["algorithm"] = "SHA256";
            d["hash"] = Sha256Hex(data);
            d["blockSize"] = BlockSize;
            d["blocks"] = blocks;
            return d;
        }

        public sealed class AsarHeaderInfo
        {
            public Dictionary<string, object> Root;
            public long BaseOffset;
        }

        public static AsarHeaderInfo ReadHeader(string asarPath)
        {
            using (var fs = File.OpenRead(asarPath))
            {
                byte[] head = new byte[16];
                if (fs.Read(head, 0, 16) < 16) throw new InvalidDataException("无效的 asar 文件: " + asarPath);
                uint hsize = BitConverter.ToUInt32(head, 4);
                uint jsize = BitConverter.ToUInt32(head, 12);
                byte[] raw = new byte[jsize];
                int read = 0;
                while (read < (int)jsize)
                {
                    int n = fs.Read(raw, read, (int)jsize - read);
                    if (n <= 0) break;
                    read += n;
                }
                string json = Encoding.UTF8.GetString(raw);
                var ser = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
                var root = ser.Deserialize<Dictionary<string, object>>(json);
                return new AsarHeaderInfo { Root = root, BaseOffset = 8L + hsize };
            }
        }

        public static void CollectEntries(Dictionary<string, object> node, string prefix, Dictionary<string, Dictionary<string, object>> output)
        {
            object filesObj;
            if (!node.TryGetValue("files", out filesObj)) return;
            var files = filesObj as Dictionary<string, object>;
            if (files == null) return;
            foreach (var kv in files)
            {
                string path = prefix + "/" + kv.Key;
                var meta = kv.Value as Dictionary<string, object>;
                if (meta == null) continue;
                if (meta.ContainsKey("files"))
                {
                    CollectEntries(meta, path, output);
                }
                else
                {
                    output[path] = meta;
                }
            }
        }

        public static byte[] ReadEntryBytes(string asarPath, Dictionary<string, object> meta, long baseOffset)
        {
            object unpackedObj;
            if (meta.TryGetValue("unpacked", out unpackedObj) && unpackedObj is bool && (bool)unpackedObj) return null;
            long offset = Convert.ToInt64(meta["offset"]);
            int size = Convert.ToInt32(meta["size"]);
            byte[] buf = new byte[size];
            using (var fs = File.OpenRead(asarPath))
            {
                fs.Seek(baseOffset + offset, SeekOrigin.Begin);
                int read = 0;
                while (read < size)
                {
                    int n = fs.Read(buf, read, size - read);
                    if (n <= 0) break;
                    read += n;
                }
            }
            return buf;
        }

        private static void WriteJsonString(StringBuilder sb, string s)
        {
            sb.Append('"');
            for (int i = 0; i < s.Length; i++)
            {
                char ch = s[i];
                switch (ch)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (ch < 32) sb.AppendFormat("\\u{0:x4}", (int)ch);
                        else sb.Append(ch);
                        break;
                }
            }
            sb.Append('"');
        }

        public static void WriteJsonValue(StringBuilder sb, object val)
        {
            if (val == null) { sb.Append("null"); return; }
            if (val is bool) { sb.Append(((bool)val) ? "true" : "false"); return; }
            if (val is int || val is long || val is double || val is float || val is decimal)
            {
                sb.Append(Convert.ToString(val, System.Globalization.CultureInfo.InvariantCulture));
                return;
            }
            if (val is string) { WriteJsonString(sb, (string)val); return; }
            var dict = val as IDictionary;
            if (dict != null)
            {
                sb.Append('{');
                bool first = true;
                foreach (DictionaryEntry de in dict)
                {
                    if (!first) sb.Append(',');
                    first = false;
                    WriteJsonString(sb, Convert.ToString(de.Key));
                    sb.Append(':');
                    WriteJsonValue(sb, de.Value);
                }
                sb.Append('}');
                return;
            }
            var list = val as IEnumerable;
            if (list != null)
            {
                sb.Append('[');
                bool first = true;
                foreach (object item in list)
                {
                    if (!first) sb.Append(',');
                    first = false;
                    WriteJsonValue(sb, item);
                }
                sb.Append(']');
                return;
            }
            WriteJsonString(sb, Convert.ToString(val));
        }

        public static int Repack(string srcAsar, string dstAsar, Dictionary<string, byte[]> replacements)
        {
            var info = ReadHeader(srcAsar);
            var entries = new Dictionary<string, Dictionary<string, object>>(StringComparer.Ordinal);
            CollectEntries(info.Root, "", entries);
            foreach (var k in replacements.Keys)
            {
                if (!entries.ContainsKey(k)) entries[k] = new Dictionary<string, object>();
            }

            var sortedPaths = new List<string>(entries.Keys);
            sortedPaths.Sort(StringComparer.Ordinal);

            var newRoot = new Dictionary<string, object>();
            var rootFiles = new Dictionary<string, object>();
            newRoot["files"] = rootFiles;

            long offset = 0;
            using (var payload = new MemoryStream())
            using (var srcFs = File.OpenRead(srcAsar))
            {
                for (int idx = 0; idx < sortedPaths.Count; idx++)
                {
                    string path = sortedPaths[idx];
                    string[] parts = path.TrimStart('/').Split('/');
                    var curFiles = rootFiles;
                    for (int p = 0; p < parts.Length - 1; p++)
                    {
                        string part = parts[p];
                        object subObj;
                        Dictionary<string, object> subNode;
                        if (!curFiles.TryGetValue(part, out subObj))
                        {
                            subNode = new Dictionary<string, object>();
                            subNode["files"] = new Dictionary<string, object>();
                            curFiles[part] = subNode;
                        }
                        else
                        {
                            subNode = (Dictionary<string, object>)subObj;
                        }
                        curFiles = (Dictionary<string, object>)subNode["files"];
                    }

                    var oldMeta = entries[path];
                    var newMeta = new Dictionary<string, object>();
                    foreach (var kv in oldMeta)
                    {
                        if (kv.Key != "offset" && kv.Key != "size" && kv.Key != "integrity" && kv.Key != "unpacked")
                        {
                            newMeta[kv.Key] = kv.Value;
                        }
                    }

                    byte[] data = null;
                    byte[] rep;
                    object unpackedObj;
                    if (replacements.TryGetValue(path, out rep))
                    {
                        data = rep;
                    }
                    else if (oldMeta.TryGetValue("unpacked", out unpackedObj) && unpackedObj is bool && (bool)unpackedObj)
                    {
                        data = null;
                    }
                    else
                    {
                        int size = Convert.ToInt32(oldMeta["size"]);
                        long srcOff = Convert.ToInt64(oldMeta["offset"]);
                        data = new byte[size];
                        srcFs.Seek(info.BaseOffset + srcOff, SeekOrigin.Begin);
                        int read = 0;
                        while (read < size)
                        {
                            int n = srcFs.Read(data, read, size - read);
                            if (n <= 0) break;
                            read += n;
                        }
                    }

                    if (data == null)
                    {
                        newMeta["unpacked"] = true;
                        if (oldMeta.ContainsKey("size")) newMeta["size"] = oldMeta["size"];
                        if (oldMeta.ContainsKey("integrity")) newMeta["integrity"] = oldMeta["integrity"];
                    }
                    else
                    {
                        newMeta["size"] = data.Length;
                        newMeta["offset"] = offset.ToString();
                        newMeta["integrity"] = BuildIntegrity(data);
                        offset += data.Length;
                        if (data.Length > 0) payload.Write(data, 0, data.Length);
                    }

                    curFiles[parts[parts.Length - 1]] = newMeta;
                }

                var sb = new StringBuilder(131072);
                WriteJsonValue(sb, newRoot);
                byte[] jsonBytes = Encoding.UTF8.GetBytes(sb.ToString());
                int padded = (jsonBytes.Length + 3) & ~3;
                int padLen = padded - jsonBytes.Length;

                using (var outFs = File.Create(dstAsar))
                using (var bw = new BinaryWriter(outFs))
                {
                    bw.Write(Magic);
                    bw.Write((uint)(8 + padded));
                    bw.Write((uint)(4 + padded));
                    bw.Write((uint)jsonBytes.Length);
                    bw.Write(jsonBytes);
                    if (padLen > 0) bw.Write(new byte[padLen]);
                    payload.Position = 0;
                    payload.CopyTo(outFs);
                }
            }

            return sortedPaths.Count;
        }
    }

    internal static class CoreManager
    {
        public const string RawBase = "https://raw.githubusercontent.com/LTctfer/Antigravity_zh_cn/main";
        public static readonly string UserDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".antigravity-zhcn");
        public static readonly string ExternalPackPath = Path.Combine(UserDir, "zh-cn.pack.js");
        public static readonly string SelfCachedExe = Path.Combine(UserDir, "Antigravity中文助手.exe");

        public static byte[] LoadResourceBytes(string name)
        {
            var asm = Assembly.GetExecutingAssembly();
            using (Stream s = asm.GetManifestResourceStream(name))
            {
                if (s == null) return null;
                byte[] buf = new byte[s.Length];
                int read = 0;
                while (read < buf.Length)
                {
                    int n = s.Read(buf, read, buf.Length - read);
                    if (n <= 0) break;
                    read += n;
                }
                return buf;
            }
        }

        public static string FindAntigravityDir(string explicitDir = null)
        {
            if (!string.IsNullOrEmpty(explicitDir))
            {
                if (File.Exists(Path.Combine(explicitDir, "resources", "app.asar"))) return Path.GetFullPath(explicitDir);
                return null;
            }
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string[] candidates = new string[]
            {
                Path.Combine(local, "Programs", "antigravity"),
                Path.Combine(local, "Programs", "Antigravity"),
                Path.Combine(pf, "Antigravity"),
                Path.Combine(pf86, "Antigravity")
            };
            foreach (string c in candidates)
            {
                if (!string.IsNullOrEmpty(c) && File.Exists(Path.Combine(c, "resources", "app.asar"))) return c;
            }
            return null;
        }

        public static bool IsAppRunning(string appDir = null)
        {
            Process[] procs = Process.GetProcessesByName("Antigravity");
            if (procs.Length == 0) return false;
            if (string.IsNullOrEmpty(appDir)) return true;
            string prefix = Path.GetFullPath(appDir).TrimEnd('\\') + "\\";
            foreach (Process p in procs)
            {
                try
                {
                    string fn = p.MainModule.FileName;
                    if (fn != null && fn.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return true;
                }
                catch { return true; }
            }
            return false;
        }

        public static void StopApp(string appDir = null)
        {
            string prefix = string.IsNullOrEmpty(appDir) ? null : Path.GetFullPath(appDir).TrimEnd('\\') + "\\";
            Process[] procs = Process.GetProcessesByName("Antigravity");
            foreach (Process p in procs)
            {
                try
                {
                    if (prefix != null)
                    {
                        string fn = p.MainModule.FileName;
                        if (fn == null || !fn.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) continue;
                    }
                    if (p.MainWindowHandle != IntPtr.Zero) p.CloseMainWindow();
                }
                catch { }
            }
            for (int i = 0; i < 15; i++)
            {
                if (!IsAppRunning(appDir)) return;
                Thread.Sleep(200);
            }
            procs = Process.GetProcessesByName("Antigravity");
            foreach (Process p in procs)
            {
                try
                {
                    if (prefix != null)
                    {
                        string fn = p.MainModule.FileName;
                        if (fn == null || !fn.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) continue;
                    }
                    p.Kill();
                }
                catch { }
            }
            for (int i = 0; i < 20; i++)
            {
                if (!IsAppRunning(appDir)) break;
                Thread.Sleep(200);
            }
        }

        public static void LaunchApp(string appDir)
        {
            string exe = Path.Combine(appDir, "Antigravity.exe");
            if (!File.Exists(exe)) throw new FileNotFoundException("未找到 Antigravity.exe", exe);
            var psi = new ProcessStartInfo
            {
                FileName = exe,
                WorkingDirectory = appDir,
                UseShellExecute = true
            };
            Process.Start(psi);
        }

        public sealed class StatusInfo
        {
            public bool ValidDir;
            public bool Installed;
            public bool HasBackup;
            public bool AppRunning;
            public bool HasExternalPack;
            public string InstalledAt;
            public string Version;
            public string PatchedSha256;
            public string OriginalSha256;
        }

        public static StatusInfo GetStatus(string appDir)
        {
            var st = new StatusInfo { AppRunning = IsAppRunning(appDir), HasExternalPack = File.Exists(ExternalPackPath) };
            if (string.IsNullOrEmpty(appDir)) return st;
            string res = Path.Combine(appDir, "resources");
            string asar = Path.Combine(res, "app.asar");
            string bak = Path.Combine(res, "app.asar.zh-cn.bak");
            string man = Path.Combine(res, "zh-cn.manifest.json");
            if (!File.Exists(asar)) return st;
            st.ValidDir = true;
            st.HasBackup = File.Exists(bak);

            try
            {
                var info = AsarHelper.ReadHeader(asar);
                var entries = new Dictionary<string, Dictionary<string, object>>();
                AsarHelper.CollectEntries(info.Root, "", entries);
                Dictionary<string, object> mainMeta;
                if (entries.ContainsKey("/dist/zh-cn/zh-cn.pack.js") && entries.TryGetValue("/dist/main.js", out mainMeta))
                {
                    byte[] mainBytes = AsarHelper.ReadEntryBytes(asar, mainMeta, info.BaseOffset);
                    if (mainBytes != null)
                    {
                        string head = Encoding.UTF8.GetString(mainBytes, 0, Math.Min(4096, mainBytes.Length));
                        st.Installed = head.Contains(AsarHelper.Marker);
                    }
                }
            }
            catch { }

            if (File.Exists(man))
            {
                try
                {
                    var ser = new JavaScriptSerializer();
                    var d = ser.Deserialize<Dictionary<string, object>>(File.ReadAllText(man, Encoding.UTF8));
                    if (d != null)
                    {
                        object v;
                        if (d.TryGetValue("installedAt", out v)) st.InstalledAt = Convert.ToString(v);
                        if (d.TryGetValue("version", out v)) st.Version = Convert.ToString(v);
                        if (d.TryGetValue("patchedSha256", out v)) st.PatchedSha256 = Convert.ToString(v);
                        if (d.TryGetValue("originalSha256", out v)) st.OriginalSha256 = Convert.ToString(v);
                    }
                }
                catch { }
            }
            return st;
        }

        public static bool IsPatchedFast(string appDir)
        {
            if (string.IsNullOrEmpty(appDir)) return false;
            string res = Path.Combine(appDir, "resources");
            string asar = Path.Combine(res, "app.asar");
            string man = Path.Combine(res, "zh-cn.manifest.json");
            if (!File.Exists(asar)) return false;
            if (File.Exists(man))
            {
                try
                {
                    var ser = new JavaScriptSerializer();
                    var d = ser.Deserialize<Dictionary<string, object>>(File.ReadAllText(man, Encoding.UTF8));
                    object shaObj;
                    if (d != null && d.TryGetValue("patchedSha256", out shaObj) && shaObj != null)
                    {
                        if (string.Equals(AsarHelper.Sha256File(asar), Convert.ToString(shaObj), StringComparison.OrdinalIgnoreCase))
                            return true;
                    }
                }
                catch { }
            }
            return GetStatus(appDir).Installed;
        }

        private static byte[] PatchMainJs(byte[] srcBytes)
        {
            string text = Encoding.UTF8.GetString(srcBytes);
            if (text.Contains(AsarHelper.Marker)) return srcBytes;
            string inject = AsarHelper.Marker + ";\n";
            string trimmed = text.TrimStart();
            string result;
            if (trimmed.StartsWith("\"use strict\";"))
            {
                int cut = text.IndexOf("\"use strict\";", StringComparison.Ordinal) + "\"use strict\";".Length;
                result = text.Substring(0, cut) + "\n" + inject + text.Substring(cut);
            }
            else if (trimmed.StartsWith("'use strict';"))
            {
                int cut = text.IndexOf("'use strict';", StringComparison.Ordinal) + "'use strict';".Length;
                result = text.Substring(0, cut) + "\n" + inject + text.Substring(cut);
            }
            else
            {
                result = inject + text;
            }
            return Encoding.UTF8.GetBytes(result);
        }

        public static void Install(string appDir, bool forceSyncExternal, Action<string> log)
        {
            string res = Path.Combine(appDir, "resources");
            string asar = Path.Combine(res, "app.asar");
            string bak = Path.Combine(res, "app.asar.zh-cn.bak");
            string man = Path.Combine(res, "zh-cn.manifest.json");

            byte[] packBytes = LoadResourceBytes("zh-cn.pack.js");
            byte[] hookBytes = LoadResourceBytes("main-hook.js");
            if (packBytes == null || hookBytes == null)
                throw new InvalidOperationException("内置语言包资源缺失，请重新构建本工具。");

            string curHash = AsarHelper.Sha256File(asar);
            var st = GetStatus(appDir);

            if (!File.Exists(bak))
            {
                File.Copy(asar, bak, true);
                if (log != null) log("已备份原始 app.asar");
            }
            else if (!st.Installed && (string.IsNullOrEmpty(st.OriginalSha256) || st.OriginalSha256 != curHash))
            {
                File.Copy(asar, bak, true);
                if (log != null) log("检测到 Antigravity 已升级，已刷新原版备份");
            }

            string origHash = AsarHelper.Sha256File(bak);
            var info = AsarHelper.ReadHeader(asar);
            var entries = new Dictionary<string, Dictionary<string, object>>();
            AsarHelper.CollectEntries(info.Root, "", entries);
            Dictionary<string, object> mainMeta;
            if (!entries.TryGetValue("/dist/main.js", out mainMeta))
                throw new InvalidDataException("asar 内缺少 dist/main.js，版本结构可能已变化。");

            byte[] mainBytes = AsarHelper.ReadEntryBytes(asar, mainMeta, info.BaseOffset);
            byte[] patchedMain = PatchMainJs(mainBytes);

            var replacements = new Dictionary<string, byte[]>();
            replacements["/dist/zh-cn/zh-cn.pack.js"] = packBytes;
            replacements["/dist/zh-cn/main-hook.js"] = hookBytes;
            replacements["/dist/main.js"] = patchedMain;

            string tmp = asar + ".zh-cn.tmp";
            int count = AsarHelper.Repack(asar, tmp, replacements);

            string aside = asar + ".locked";
            if (File.Exists(aside)) try { File.Delete(aside); } catch { }
            try
            {
                File.Move(asar, aside);
                try
                {
                    File.Move(tmp, asar);
                }
                catch
                {
                    if (!File.Exists(asar) && File.Exists(aside)) File.Move(aside, asar);
                    throw;
                }
                try { File.Delete(aside); } catch { }
            }
            catch (Exception ex)
            {
                if (File.Exists(tmp)) try { File.Delete(tmp); } catch { }
                throw new IOException("写入 app.asar 失败（可能被 Antigravity 占用）: " + ex.Message, ex);
            }

            string ver = "1.0.0";
            byte[] metaBytes = LoadResourceBytes("meta.json");
            if (metaBytes != null)
            {
                try
                {
                    var ser = new JavaScriptSerializer();
                    var m = ser.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(metaBytes));
                    if (m != null && m.ContainsKey("version")) ver = Convert.ToString(m["version"]);
                }
                catch { }
            }

            var manDict = new Dictionary<string, object>();
            manDict["name"] = "Antigravity 简体中文语言层";
            manDict["version"] = ver;
            manDict["installedAt"] = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
            manDict["originalSha256"] = origHash;
            manDict["patchedSha256"] = AsarHelper.Sha256File(asar);
            manDict["entries"] = count;
            manDict["marker"] = AsarHelper.Marker;

            var sbMan = new StringBuilder();
            AsarHelper.WriteJsonValue(sbMan, manDict);
            File.WriteAllText(man, sbMan.ToString(), new UTF8Encoding(false));

            Directory.CreateDirectory(UserDir);
            if (forceSyncExternal || !File.Exists(ExternalPackPath))
            {
                File.WriteAllBytes(ExternalPackPath, packBytes);
                if (log != null) log("已同步外置词库 -> " + ExternalPackPath);
            }

            // 同步当前 exe 到用户目录供桌面自愈快捷方式长期调用
            try
            {
                string self = Assembly.GetExecutingAssembly().Location;
                if (!string.Equals(Path.GetFullPath(self), Path.GetFullPath(SelfCachedExe), StringComparison.OrdinalIgnoreCase))
                {
                    File.Copy(self, SelfCachedExe, true);
                }
            }
            catch { }

            if (log != null) log("汉化补丁安装成功（总条目 " + count + "）！");
        }

        public static void UpdateExternalDict(bool online, Action<string> log)
        {
            Directory.CreateDirectory(UserDir);
            if (online)
            {
                if (log != null) log("正在从 GitHub 下载最新词库...");
                ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
                using (var wc = new WebClient())
                {
                    wc.Headers.Add("User-Agent", "Antigravity-zh-cn-exe");
                    byte[] data = wc.DownloadData(RawBase + "/build/zh-cn.pack.js");
                    if (data.Length < 1000) throw new InvalidDataException("下载的词库内容异常");
                    File.WriteAllBytes(ExternalPackPath, data);
                }
                if (log != null) log("已在线更新外置词库（" + (new FileInfo(ExternalPackPath).Length / 1024) + " KB）");
            }
            else
            {
                byte[] packBytes = LoadResourceBytes("zh-cn.pack.js");
                if (packBytes == null) throw new InvalidOperationException("内置词库缺失");
                File.WriteAllBytes(ExternalPackPath, packBytes);
                if (log != null) log("已同步内置词库到外置目录");
            }
            if (log != null) log("提示：若 Antigravity 正在运行，按 Alt+Shift+R 即可热重载生效！");
        }

        public static void Restore(string appDir, Action<string> log)
        {
            string res = Path.Combine(appDir, "resources");
            string asar = Path.Combine(res, "app.asar");
            string bak = Path.Combine(res, "app.asar.zh-cn.bak");
            string man = Path.Combine(res, "zh-cn.manifest.json");
            if (!File.Exists(bak)) throw new FileNotFoundException("未找到原版备份，无法还原", bak);
            File.Copy(bak, asar, true);
            if (File.Exists(man)) File.Delete(man);
            if (log != null) log("已成功还原为英文原版！");
        }

        public static string CreateDesktopShortcut(string appDir)
        {
            Directory.CreateDirectory(UserDir);
            string self = Assembly.GetExecutingAssembly().Location;
            if (!string.Equals(Path.GetFullPath(self), Path.GetFullPath(SelfCachedExe), StringComparison.OrdinalIgnoreCase))
            {
                File.Copy(self, SelfCachedExe, true);
            }
            string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            string lnkPath = Path.Combine(desktop, "Antigravity (中文版).lnk");

            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            object wsh = Activator.CreateInstance(shellType);
            object sc = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, wsh, new object[] { lnkPath });
            Type scType = sc.GetType();
            scType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, sc, new object[] { SelfCachedExe });
            scType.InvokeMember("Arguments", BindingFlags.SetProperty, null, sc, new object[] { "--launch --dir \"" + appDir + "\"" });
            scType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, sc, new object[] { appDir });
            scType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, sc, new object[] { Path.Combine(appDir, "Antigravity.exe") + ",0" });
            scType.InvokeMember("Description", BindingFlags.SetProperty, null, sc, new object[] { "启动 Antigravity 简体中文版（官方升级后自动静默修复汉化）" });
            scType.InvokeMember("Save", BindingFlags.InvokeMethod, null, sc, null);
            return lnkPath;
        }
    }

    internal sealed class MainForm : Form
    {
        private TextBox txtDir;
        private Button btnBrowse;
        private Label lblStatus;
        private Label lblDetail;
        private Button btnInstall;
        private Button btnUpdateLocal;
        private Button btnUpdateOnline;
        private Button btnShortcut;
        private Button btnRestore;
        private TextBox txtLog;
        private bool busy = false;

        public MainForm()
        {
            InitializeUi();
            RefreshStatus();
        }

        private void InitializeUi()
        {
            Text = "Antigravity 简体中文语言助手";
            ClientSize = new Size(560, 490);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(248, 249, 252);
            Font = new Font("Microsoft YaHei UI", 9.5f);

            var lblTitle = new Label
            {
                Text = "Antigravity 简体中文语言层",
                Font = new Font("Microsoft YaHei UI", 14f, FontStyle.Bold),
                ForeColor = Color.FromArgb(24, 24, 27),
                Location = new Point(22, 16),
                AutoSize = true
            };
            var lblSub = new Label
            {
                Text = "1900+ 词条 · 54 条动态规则 · 外置热重载 · 官方升级自动自愈",
                Font = new Font("Microsoft YaHei UI", 8.5f),
                ForeColor = Color.FromArgb(100, 116, 139),
                Location = new Point(24, 46),
                AutoSize = true
            };

            var lblDirTitle = new Label
            {
                Text = "安装目录：",
                Location = new Point(22, 82),
                AutoSize = true,
                ForeColor = Color.FromArgb(51, 65, 85)
            };
            txtDir = new TextBox
            {
                Location = new Point(98, 79),
                Size = new Size(358, 26),
                Text = CoreManager.FindAntigravityDir() ?? ""
            };
            btnBrowse = new Button
            {
                Text = "浏览...",
                Location = new Point(464, 78),
                Size = new Size(74, 28),
                FlatStyle = FlatStyle.System
            };
            btnBrowse.Click += delegate
            {
                using (var dlg = new FolderBrowserDialog { Description = "选择包含 Antigravity.exe 的目录" })
                {
                    if (!string.IsNullOrEmpty(txtDir.Text) && Directory.Exists(txtDir.Text))
                        dlg.SelectedPath = txtDir.Text;
                    if (dlg.ShowDialog(this) == DialogResult.OK)
                    {
                        txtDir.Text = dlg.SelectedPath;
                        RefreshStatus();
                    }
                }
            };

            var card = new Panel
            {
                Location = new Point(22, 118),
                Size = new Size(516, 78),
                BackColor = Color.White,
                BorderStyle = BorderStyle.FixedSingle
            };
            lblStatus = new Label
            {
                Location = new Point(14, 12),
                Size = new Size(488, 24),
                Font = new Font("Microsoft YaHei UI", 10.5f, FontStyle.Bold)
            };
            lblDetail = new Label
            {
                Location = new Point(14, 40),
                Size = new Size(488, 26),
                Font = new Font("Microsoft YaHei UI", 8.5f),
                ForeColor = Color.FromArgb(100, 116, 139)
            };
            card.Controls.Add(lblStatus);
            card.Controls.Add(lblDetail);

            btnInstall = MakeBtn("一键安装 / 修复汉化", new Point(22, 212), new Size(250, 42), true);
            btnInstall.Click += delegate { RunInstall(); };

            btnShortcut = MakeBtn("创建桌面自愈快捷方式", new Point(288, 212), new Size(250, 42), false);
            btnShortcut.Click += delegate { RunShortcut(); };

            btnUpdateLocal = MakeBtn("同步本地词库（热更新）", new Point(22, 266), new Size(166, 36), false);
            btnUpdateLocal.Click += delegate { RunUpdateDict(false); };

            btnUpdateOnline = MakeBtn("在线拉取最新词库", new Point(197, 266), new Size(166, 36), false);
            btnUpdateOnline.Click += delegate { RunUpdateDict(true); };

            btnRestore = MakeBtn("还原英文原版", new Point(372, 266), new Size(166, 36), false);
            btnRestore.ForeColor = Color.FromArgb(185, 28, 28);
            btnRestore.Click += delegate { RunRestore(); };

            var lblKeys = new Label
            {
                Text = "常用快捷键：Alt+Shift+L 中英即时切换  |  Alt+Shift+R 热重载词库  |  Alt+Shift+C 复制漏翻词条",
                Location = new Point(22, 314),
                Size = new Size(516, 20),
                Font = new Font("Microsoft YaHei UI", 8.5f),
                ForeColor = Color.FromArgb(71, 85, 105)
            };

            txtLog = new TextBox
            {
                Location = new Point(22, 340),
                Size = new Size(516, 130),
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Vertical,
                BackColor = Color.FromArgb(15, 23, 42),
                ForeColor = Color.FromArgb(226, 232, 240),
                Font = new Font("Consolas", 9f),
                BorderStyle = BorderStyle.FixedSingle
            };

            Controls.AddRange(new Control[]
            {
                lblTitle, lblSub, lblDirTitle, txtDir, btnBrowse, card,
                btnInstall, btnShortcut, btnUpdateLocal, btnUpdateOnline, btnRestore,
                lblKeys, txtLog
            });
        }

        private static Button MakeBtn(string text, Point loc, Size size, bool primary)
        {
            var b = new Button
            {
                Text = text,
                Location = loc,
                Size = size,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            if (primary)
            {
                b.BackColor = Color.FromArgb(37, 99, 235);
                b.ForeColor = Color.White;
                b.FlatAppearance.BorderSize = 0;
                b.Font = new Font("Microsoft YaHei UI", 9.5f, FontStyle.Bold);
            }
            else
            {
                b.BackColor = Color.White;
                b.ForeColor = Color.FromArgb(30, 41, 59);
                b.FlatAppearance.BorderColor = Color.FromArgb(203, 213, 225);
            }
            return b;
        }

        private void AppendLog(string msg)
        {
            if (InvokeRequired)
            {
                BeginInvoke(new Action<string>(AppendLog), msg);
                return;
            }
            txtLog.AppendText("[" + DateTime.Now.ToString("HH:mm:ss") + "] " + msg + Environment.NewLine);
        }

        private void SetBusy(bool state)
        {
            if (InvokeRequired)
            {
                BeginInvoke(new Action<bool>(SetBusy), state);
                return;
            }
            busy = state;
            btnInstall.Enabled = !state;
            btnShortcut.Enabled = !state;
            btnUpdateLocal.Enabled = !state;
            btnUpdateOnline.Enabled = !state;
            btnRestore.Enabled = !state;
            btnBrowse.Enabled = !state;
        }

        private void RefreshStatus()
        {
            if (InvokeRequired)
            {
                BeginInvoke(new Action(RefreshStatus));
                return;
            }
            string dir = txtDir.Text.Trim();
            var st = CoreManager.GetStatus(dir);
            if (!st.ValidDir)
            {
                lblStatus.Text = "未检测到 Antigravity（请手动选择安装目录）";
                lblStatus.ForeColor = Color.FromArgb(185, 28, 28);
                lblDetail.Text = "目录内需要包含 resources\\app.asar";
                return;
            }
            if (st.Installed)
            {
                lblStatus.Text = "已安装简体中文补丁" + (st.AppRunning ? "（Antigravity 运行中）" : "");
                lblStatus.ForeColor = Color.FromArgb(21, 128, 61);
                lblDetail.Text = string.Format("版本：{0}  |  安装时间：{1}  |  外置词库：{2}",
                    st.Version ?? "1.0.0",
                    st.InstalledAt ?? "未知",
                    st.HasExternalPack ? "已就绪" : "未同步");
            }
            else
            {
                lblStatus.Text = "未安装中文补丁（或官方更新后已重置为英文）";
                lblStatus.ForeColor = Color.FromArgb(194, 65, 12);
                lblDetail.Text = string.Format("原版备份：{0}  |  运行状态：{1}",
                    st.HasBackup ? "存在" : "首次安装时自动创建",
                    st.AppRunning ? "运行中" : "未运行");
            }
        }

        private void RunAsync(Action work)
        {
            if (busy) return;
            SetBusy(true);
            ThreadPool.QueueUserWorkItem(delegate
            {
                try { work(); }
                catch (Exception ex) { AppendLog("错误：" + ex.Message); }
                finally { SetBusy(false); RefreshStatus(); }
            });
        }

        private void RunInstall()
        {
            string dir = txtDir.Text.Trim();
            if (string.IsNullOrEmpty(dir) || !File.Exists(Path.Combine(dir, "resources", "app.asar")))
            {
                MessageBox.Show(this, "请先选择有效的 Antigravity 安装目录！", "提示", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            bool needRestart = false;
            if (CoreManager.IsAppRunning(dir))
            {
                var r = MessageBox.Show(this,
                    "检测到 Antigravity 正在运行，需先关闭才能写入 app.asar。\n是否立即关闭并在安装完成后自动重新打开？",
                    "需要关闭 Antigravity", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
                if (r != DialogResult.Yes) return;
                needRestart = true;
            }
            RunAsync(delegate
            {
                if (needRestart)
                {
                    AppendLog("正在关闭 Antigravity...");
                    CoreManager.StopApp(dir);
                }
                CoreManager.Install(dir, true, AppendLog);
                if (needRestart)
                {
                    AppendLog("正在重新启动 Antigravity...");
                    CoreManager.LaunchApp(dir);
                }
                else
                {
                    BeginInvoke(new Action(delegate
                    {
                        if (MessageBox.Show(this, "安装成功！是否立即启动 Antigravity？", "完成",
                            MessageBoxButtons.YesNo, MessageBoxIcon.Information) == DialogResult.Yes)
                        {
                            CoreManager.LaunchApp(dir);
                        }
                    }));
                }
            });
        }

        private void RunUpdateDict(bool online)
        {
            RunAsync(delegate { CoreManager.UpdateExternalDict(online, AppendLog); });
        }

        private void RunShortcut()
        {
            string dir = txtDir.Text.Trim();
            if (string.IsNullOrEmpty(dir) || !File.Exists(Path.Combine(dir, "Antigravity.exe")))
            {
                MessageBox.Show(this, "请先选择有效的 Antigravity 安装目录！", "提示", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            RunAsync(delegate
            {
                string lnk = CoreManager.CreateDesktopShortcut(dir);
                AppendLog("已创建桌面自愈快捷方式 -> " + lnk);
                BeginInvoke(new Action(delegate
                {
                    MessageBox.Show(this, "已创建桌面图标“Antigravity (中文版)”！\n以后从该图标启动会自动检测并在更新后静默修复汉化。",
                        "完成", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }));
            });
        }

        private void RunRestore()
        {
            string dir = txtDir.Text.Trim();
            if (string.IsNullOrEmpty(dir)) return;
            bool needRestart = false;
            if (CoreManager.IsAppRunning(dir))
            {
                var r = MessageBox.Show(this,
                    "检测到 Antigravity 正在运行，是否立即关闭并还原为英文原版？",
                    "确认还原", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
                if (r != DialogResult.Yes) return;
                needRestart = true;
            }
            RunAsync(delegate
            {
                if (needRestart)
                {
                    AppendLog("正在关闭 Antigravity...");
                    CoreManager.StopApp(dir);
                }
                CoreManager.Restore(dir, AppendLog);
                if (needRestart)
                {
                    AppendLog("正在启动英文原版 Antigravity...");
                    CoreManager.LaunchApp(dir);
                }
            });
        }
    }

    internal static class Program
    {
        [STAThread]
        private static int Main(string[] args)
        {
            try { NativeMethods.SetProcessDPIAware(); } catch { }

            bool launch = false;
            bool ensure = false;
            string explicitDir = null;

            for (int i = 0; i < args.Length; i++)
            {
                string a = args[i].ToLowerInvariant();
                if (a == "--launch" || a == "-launch") launch = true;
                else if (a == "--ensure" || a == "-ensure") ensure = true;
                else if ((a == "--dir" || a == "-dir") && i + 1 < args.Length) explicitDir = args[++i];
            }

            if (launch || ensure)
            {
                try
                {
                    string dir = CoreManager.FindAntigravityDir(explicitDir);
                    if (!string.IsNullOrEmpty(dir))
                    {
                        if (!CoreManager.IsPatchedFast(dir))
                        {
                            if (CoreManager.IsAppRunning(dir)) CoreManager.StopApp(dir);
                            CoreManager.Install(dir, false, null);
                        }
                        if (launch) CoreManager.LaunchApp(dir);
                    }
                    return 0;
                }
                catch (Exception ex)
                {
                    if (launch)
                        MessageBox.Show("启动修复失败：" + ex.Message, "Antigravity 中文助手", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return 1;
                }
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
            return 0;
        }
    }
}
