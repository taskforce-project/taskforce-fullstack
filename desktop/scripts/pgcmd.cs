// pgcmd : remplaçant de cmd.exe pour PostgreSQL, dans la version Microsoft Store de l'app desktop.
//
// Sous Windows, PostgreSQL lance certaines commandes par popen(), donc par l'interpréteur que nomme COMSPEC
// (cmd.exe) : au démarrage, le serveur vérifie ainsi la version de son propre programme (`"postgres.exe" -V`). Dans un
// paquet du Store, Windows ne laisse un programme du paquet en lancer un autre que directement ; cmd.exe, programme du
// système, n'y a pas droit (« Access is denied ») et le serveur refuse de démarrer. pgcmd, livré dans le paquet, prend
// la place de cmd.exe pour les processus de la base (COMSPEC, desktop/src/postgres.ts) et lance la commande lui-même.
//
// Seule la forme qu'emploie PostgreSQL est admise : `pgcmd [/d] /c "<programme entre guillemets> <arguments>"`, sans
// redirection ni enchaînement. Le programme hérite des entrées et sorties de pgcmd ; son code de sortie est rendu.
//
// Construit par scripts/prepare-resources.mjs avec le compilateur C# de .NET Framework, présent sur tout Windows.
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;

static class PgCmd
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct StartupInfo
    {
        public int cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
        public short wShowWindow, cbReserved2;
        public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct ProcessInformation
    {
        public IntPtr hProcess, hThread;
        public int dwProcessId, dwThreadId;
    }

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool CreateProcessW(string applicationName, StringBuilder commandLine, IntPtr processAttributes,
        IntPtr threadAttributes, bool inheritHandles, int creationFlags, IntPtr environment, string currentDirectory,
        ref StartupInfo startupInfo, out ProcessInformation processInformation);

    [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int stdHandle);
    [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);

    const int StartfUseStdHandles = 0x100;
    const uint Infinite = 0xFFFFFFFF;

    static int Main()
    {
        string command = Command(Environment.CommandLine);
        if (command == null) return Fail("usage: pgcmd [/d] /c \"<program> <arguments>\"");
        if (!Simple(command)) return Fail("only a program and its arguments are supported, without redirection: " + command);

        var startup = new StartupInfo
        {
            cb = Marshal.SizeOf(typeof(StartupInfo)),
            dwFlags = StartfUseStdHandles,
            hStdInput = GetStdHandle(-10),
            hStdOutput = GetStdHandle(-11),
            hStdError = GetStdHandle(-12),
        };
        ProcessInformation process;
        if (!CreateProcessW(null, new StringBuilder(command), IntPtr.Zero, IntPtr.Zero, true, 0, IntPtr.Zero, null,
            ref startup, out process))
        {
            return Fail(new Win32Exception(Marshal.GetLastWin32Error()).Message + ": " + command);
        }
        CloseHandle(process.hThread);
        WaitForSingleObject(process.hProcess, Infinite);
        uint code;
        GetExitCodeProcess(process.hProcess, out code);
        CloseHandle(process.hProcess);
        return (int)code;
    }

    /// <summary>
    /// La commande qui suit /c, comme cmd.exe la lit : passé l'interpréteur et ses options, et, quand elle commence par
    /// un guillemet, sans ce premier guillemet ni le dernier (PostgreSQL entoure ainsi sa commande d'une paire de plus).
    /// popen() écrit le chemin de l'interpréteur sans guillemets, espaces compris (C:\Program Files\WindowsApps\...) :
    /// les options se cherchent donc après le premier blanc suivi d'une barre, que ce chemin ne contient jamais.
    /// </summary>
    static string Command(string line)
    {
        Match options = Regex.Match(line, @"\s(?:/[dDsS]\s+)*/[cC](?=[\s""]|$)");
        if (!options.Success) return null;
        string command = line.Substring(options.Index + options.Length).Trim();
        if (command.StartsWith("\"") && command.Split('"').Length - 1 > 2)
        {
            int last = command.LastIndexOf('"');
            command = command.Substring(1, last - 1) + command.Substring(last + 1);
        }
        return command.Length == 0 ? null : command;
    }

    /// <summary>Ni redirection, ni enchaînement, ni variable hors des guillemets : un programme et ses arguments.</summary>
    static bool Simple(string command)
    {
        bool quoted = false;
        foreach (char c in command)
        {
            if (c == '"') quoted = !quoted;
            else if (!quoted && "<>|&^%".IndexOf(c) >= 0) return false;
        }
        return !quoted;
    }

    static int Fail(string message)
    {
        Console.Error.WriteLine("pgcmd: " + message);
        return 1;
    }
}
