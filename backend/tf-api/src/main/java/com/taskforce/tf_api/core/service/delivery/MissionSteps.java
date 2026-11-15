package com.taskforce.tf_api.core.service.delivery;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * L'étape où en est une mission, des cinq du déroulé (comprendre, prévoir, faire, vérifier, rendre), calculée par le
 * serveur avec les règles de l'écran ({@code frontend/lib/delivery/mission-sequence.ts}, l'étape marquée « current ») :
 * la vue du workflow la montre pour chaque mission sans lire chaque chronologie. Les deux côtés rejouent les mêmes cas,
 * {@code contracts/mission-steps/cases.json}, et doivent rendre la même étape ; une règle changée d'un côté sans l'autre
 * fait échouer l'un des deux.
 *
 * <p>Ce qu'un appel d'outil veut dire se lit comme à l'écran : lire, changer quelque chose, prévoir, vérifier, ou rien de
 * notable ; une ligne de commande, morceau par morceau. Les expressions de l'écran sont reprises avec les blancs de
 * JavaScript ({@code \s}), et {@code \z} pour sa fin de texte, pour qu'un texte se lise de la même façon des deux côtés.</p>
 */
public final class MissionSteps {

    public static final String UNDERSTAND = "understand";
    public static final String PLAN = "plan";
    public static final String DO = "do";
    public static final String CHECK = "check";
    public static final String HANDOVER = "handover";

    /** Un événement de la chronologie : sa sorte ({@code start}, {@code text}, {@code tool}...), l'outil, le texte. */
    public record Event(String kind, String tool, String text) {}

    /** Une demande de la mission : l'outil, ce qu'il ferait, son état ({@code PENDING}...). */
    public record Request(String tool, String summary, String status) {}

    /** Lire, changer, prévoir, vérifier ; {@code NEUTRAL} : on ne sait pas s'il change quelque chose. */
    enum Nature { READ, CHANGE, PLAN, TEST, NEUTRAL }

    private MissionSteps() {}

    /**
     * L'étape en cours. Une mission finie rend ; une demande encore ouverte d'une mission en cours la place à l'étape de
     * ce qu'elle demande ; sinon la dernière étape de la chronologie, où « comprendre » et « prévoir » se départagent selon
     * que l'agent a dit ce qu'il va produire.
     */
    public static String current(String status, List<Event> events, List<Request> requests) {
        boolean wrote = false;
        boolean hasRead = false;
        boolean planned = false;
        String last = null;
        for (Event event : events) {
            String previous = last == null ? UNDERSTAND : last;
            String text = event.text() == null ? "" : event.text();
            switch (event.kind() == null ? "" : event.kind()) {
                case "start" -> last = UNDERSTAND;
                case "text" -> {
                    // Les derniers mots d'une mission rendue vont à « rendre » : rendue, la mission y est de toute façon.
                    if (!wrote && hasRead && sentencesOf(text).stream().anyMatch(MissionSteps::announcesWork)) planned = true;
                    last = wrote ? DO : PLAN;
                }
                case "tool" -> {
                    Nature nature = toolNature(event.tool() == null ? "" : event.tool(), text);
                    last = byNature(nature, wrote);
                    if (nature == Nature.CHANGE) wrote = true;
                    if (nature == Nature.READ || nature == Nature.NEUTRAL) hasRead = true;
                    if (nature == Nature.PLAN && !wrote) planned = true;
                }
                case "denied" -> last = byNature(toolNature(event.tool() == null ? "" : event.tool(), ""), wrote);
                case "test" -> last = CHECK;
                case "exit" -> last = HANDOVER;
                default -> last = previous;
            }
        }
        Request asked = "RUNNING".equals(status) ? requests.stream()
            .filter(r -> "PENDING".equals(r.status())).findFirst().orElse(null) : null;
        if (asked != null) {
            String step = RUNNER_REQUESTS.get(asked.tool());
            return step != null ? step
                : byNature(toolNature(asked.tool() == null ? "" : asked.tool(), asked.summary() == null ? "" : asked.summary()), wrote);
        }
        if ("DONE".equals(status)) return HANDOVER;
        if (last == null || UNDERSTAND.equals(last) || PLAN.equals(last)) return planned ? PLAN : UNDERSTAND;
        return last;
    }

    static String byNature(Nature nature, boolean wrote) {
        if (nature == Nature.TEST) return CHECK;
        if (nature == Nature.CHANGE || wrote) return DO;
        return nature == Nature.PLAN ? PLAN : UNDERSTAND;
    }

    /** Les demandes que le runner pose lui-même : leur outil est le nom de ce qu'il veut faire. */
    private static final Map<String, String> RUNNER_REQUESTS = Map.of(
        "Start the mission", UNDERSTAND,
        "Run the project's tests", CHECK,
        "git push", HANDOVER,
        "gh pr create", HANDOVER);

    // ---------------------------------------------------------------------------------------------------- les phrases

    /** Les blancs de JavaScript ({@code \s}), et un caractère qui n'en est pas un. */
    private static final String SPACES = "\\t\\n\\u000B\\f\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF";
    private static final String SPACE = "[" + SPACES + "]";
    private static final String NOT_SPACE = "[^" + SPACES + "]";
    /** Ce que le {@code .} de JavaScript ne prend pas. */
    private static final String NOT_LINE_END = "[^\\n\\r\\u2028\\u2029]";

    private static final Pattern MARKS = Pattern.compile("[*`]+");
    private static final Pattern HEADING = Pattern.compile("^#+" + SPACE + "*");
    private static final Pattern BLANKS = Pattern.compile(SPACE + "+");
    private static final Pattern SENTENCE_END = Pattern.compile("(?<=[.!?])" + SPACE + "+");
    private static final int WORDS_CASE = Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE;
    private static final Pattern ANNOUNCES = Pattern.compile(
        "\\b(?:I['’]ll|I will|I['’]m going to|I am going to|My plan|Je vais)\\b", WORDS_CASE);
    private static final Pattern ONLY_LOOKS = Pattern.compile(
        "\\b(?:I['’]ll|I will|I['’]m going to|I am going to|Je vais)" + SPACE + "+(?:first" + SPACE + "+|now" + SPACE
            + "+|start" + SPACE + "+by" + SPACE + "+|begin" + SPACE + "+by" + SPACE + "+)?(?:look|read|check|search|see|find|get|"
            + "fetch|review|examine|inspect|explore|verify|open|understand|getting|searching|reading|looking|commencer|regarder|"
            + "lire|vérifier|chercher)", WORDS_CASE);

    /** Le {@code trim()} de JavaScript. */
    static String jsTrim(String text) {
        int start = 0;
        int end = text.length();
        while (start < end && isJsSpace(text.charAt(start))) start++;
        while (end > start && isJsSpace(text.charAt(end - 1))) end--;
        return text.substring(start, end);
    }

    private static boolean isJsSpace(char c) {
        return c == '\t' || c == '\n' || c == '\u000B' || c == '\f' || c == '\r' || c == ' ' || c == '\u00A0'
            || c == '\u1680' || (c >= '\u2000' && c <= '\u200A') || c == '\u2028' || c == '\u2029' || c == '\u202F'
            || c == '\u205F' || c == '\u3000' || c == '\uFEFF';
    }

    /** L'agent écrit en Markdown ; une phrase n'en garde pas les marques. */
    static String plainWords(String text) {
        String bare = MARKS.matcher(text).replaceAll("");
        bare = HEADING.matcher(bare).replaceFirst("");
        return jsTrim(BLANKS.matcher(bare).replaceAll(" "));
    }

    static List<String> sentencesOf(String text) {
        List<String> sentences = new ArrayList<>();
        for (String sentence : SENTENCE_END.split(plainWords(text), -1)) {
            if (!sentence.isEmpty()) sentences.add(sentence);
        }
        return sentences;
    }

    /** Une phrase où l'agent annonce ce qu'il va produire, pas seulement ce qu'il va regarder. */
    static boolean announcesWork(String sentence) {
        return ANNOUNCES.matcher(sentence).find() && !ONLY_LOOKS.matcher(sentence).find();
    }

    // ------------------------------------------------------------------------------------------------------ les gestes

    private static final Map<String, Nature> NATIVE = Map.ofEntries(
        Map.entry("Read", Nature.READ), Map.entry("NotebookRead", Nature.READ), Map.entry("Glob", Nature.READ),
        Map.entry("LS", Nature.READ), Map.entry("Grep", Nature.READ), Map.entry("WebFetch", Nature.READ),
        Map.entry("WebSearch", Nature.READ), Map.entry("Write", Nature.CHANGE), Map.entry("Edit", Nature.CHANGE),
        Map.entry("MultiEdit", Nature.CHANGE), Map.entry("NotebookEdit", Nature.CHANGE), Map.entry("TodoWrite", Nature.PLAN),
        Map.entry("ExitPlanMode", Nature.PLAN), Map.entry("Task", Nature.NEUTRAL), Map.entry("Agent", Nature.NEUTRAL),
        Map.entry("Skill", Nature.NEUTRAL));

    /** Les outils du serveur MCP de TaskForce ({@code TaskforceMcpTools}). */
    private static final Map<String, Nature> TASKFORCE = Map.ofEntries(
        Map.entry("get_issue", Nature.READ), Map.entry("list_issues", Nature.READ), Map.entry("list_projects", Nature.READ),
        Map.entry("list_issue_statuses", Nature.READ), Map.entry("list_my_issues", Nature.READ),
        Map.entry("workspace_kpis", Nature.READ), Map.entry("brain_search", Nature.READ), Map.entry("get_mission", Nature.READ),
        Map.entry("smart_assign", Nature.READ), Map.entry("ask_cortex", Nature.READ), Map.entry("add_comment", Nature.CHANGE),
        Map.entry("create_issue", Nature.CHANGE), Map.entry("update_issue", Nature.CHANGE),
        Map.entry("check_checklist_item", Nature.CHANGE), Map.entry("delegate_issue", Nature.CHANGE),
        Map.entry("delete_issue", Nature.CHANGE), Map.entry("create_project", Nature.CHANGE));

    /** Un outil d'un serveur MCP : « serveur: outil ». */
    private static final Pattern MCP_TOOL = Pattern.compile("([^:]+): (" + NOT_LINE_END + "+)");
    private static final Pattern CONNECTOR_READS = Pattern.compile("^(get|list|search|read|find|fetch|query)", Pattern.CASE_INSENSITIVE);
    private static final Pattern CONNECTOR_CHANGES = Pattern.compile(
        "^(create|update|add|delete|remove|set|move|post|send|write|edit|merge|close|assign)", Pattern.CASE_INSENSITIVE);

    static Nature toolNature(String tool, String text) {
        if ("Bash".equals(tool)) return commandNature(text);
        Nature known = NATIVE.get(tool);
        if (known != null) return known;
        Matcher mcp = MCP_TOOL.matcher(tool);
        boolean fromServer = mcp.matches();
        String name = fromServer ? mcp.group(2) : tool;
        if (!fromServer || "taskforce".equals(mcp.group(1))) {
            Nature own = TASKFORCE.get(name);
            return own != null ? own : Nature.NEUTRAL;
        }
        if (CONNECTOR_READS.matcher(name).find()) return Nature.READ;
        if (CONNECTOR_CHANGES.matcher(name).find()) return Nature.CHANGE;
        return Nature.NEUTRAL;
    }

    // ------------------------------------------------------------------------------------------- une ligne de commande

    private static final Map<String, Nature> PROGRAMS = programs();
    private static final Map<String, Map<String, Nature>> SUBCOMMANDS = subcommands();
    private static final Map<String, Nature> GIT = git();
    private static final Set<String> WRAPPERS = Set.of("sudo", "time", "env", "npx", "command", "exec", "nohup", "uvx", "bunx", "pnpx");
    private static final Set<String> NOISE = Set.of("cd", "echo", "printf", "true", "false", "sleep", "exit", "set", "export",
        "clear", ":", "pushd", "popd", "source", ".");
    private static final Set<String> PACKAGE_MANAGERS = Set.of("npm", "pnpm", "yarn", "bun");

    private static final Pattern WORD = Pattern.compile("\"[^\"]*\"|'[^']*'|" + NOT_SPACE + "+");
    private static final Pattern ASSIGNMENT = Pattern.compile("^\\w+=");
    private static final Pattern QUOTED_ENDS = Pattern.compile("^[\"']|[\"']\\z");
    private static final Pattern PATH_SEPARATOR = Pattern.compile("[\\\\/]");
    private static final Pattern EXECUTABLE = Pattern.compile("\\.(exe|cmd|bat|ps1)\\z");
    private static final Pattern QUOTED = Pattern.compile("\"[^\"]*\"|'[^']*'");
    private static final Pattern OPEN_QUOTE = Pattern.compile("[\"']" + NOT_LINE_END + "*\\z");
    private static final Pattern REDIRECT = Pattern.compile("(?<![\\d&])>>?" + SPACE + "*([^" + SPACES + "&|;<>]+)");
    private static final Pattern NOWHERE = Pattern.compile("(/dev/null|nul|\\$null)", Pattern.CASE_INSENSITIVE);
    private static final Pattern INSTALL_SCRIPT = Pattern.compile("(i|install|ci|add)");
    private static final Pattern TEST_SCRIPT = Pattern.compile("^(t|test)(:|\\z)");
    private static final Pattern CHECK_SCRIPT = Pattern.compile("^(lint|typecheck|type-check|check-types|check)(:|\\z)");
    private static final Pattern BRANCH_FLAG = Pattern.compile("-[bcBC]");
    private static final Pattern GITHUB_READS = Pattern.compile("(view|list|status|diff|checks|watch)");

    /** Ses tests d'abord, puis ce qu'elle change, sinon le premier de ses morceaux. */
    static Nature commandNature(String line) {
        Nature best = null;
        for (String part : simpleCommands(line)) {
            Nature found = partNature(part);
            if (found != null && (best == null || rank(found) > rank(best))) best = found;
        }
        return best == null ? Nature.NEUTRAL : best;
    }

    private static int rank(Nature nature) {
        return switch (nature) {
            case TEST -> 3;
            case CHANGE -> 2;
            default -> 1;
        };
    }

    /** Les commandes simples d'une ligne ({@code &&}, {@code ||}, {@code ;}, {@code |}), hors des guillemets. */
    static List<String> simpleCommands(String line) {
        List<String> parts = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        char quote = 0;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            char next = i + 1 < line.length() ? line.charAt(i + 1) : 0;
            if (quote != 0) {
                if (c == quote) quote = 0;
                current.append(c);
            } else if (c == '"' || c == '\'') {
                quote = c;
                current.append(c);
            } else if (c == ';' || c == '|' || c == '\n' || (c == '&' && next == '&')) {
                parts.add(current.toString());
                current.setLength(0);
                if (c == '&' || (c == '|' && next == '|')) i++;
            } else {
                current.append(c);
            }
        }
        parts.add(current.toString());
        List<String> commands = new ArrayList<>();
        for (String part : parts) {
            String trimmed = jsTrim(part);
            if (!trimmed.isEmpty()) commands.add(trimmed);
        }
        return commands;
    }

    /** Le fichier qu'une redirection écrit ; null sans redirection, ou vers nulle part. */
    static String redirectTarget(String part) {
        String bare = QUOTED.matcher(part).replaceAll("_");
        bare = OPEN_QUOTE.matcher(bare).replaceFirst("");
        Matcher redirect = REDIRECT.matcher(bare);
        if (!redirect.find()) return null;
        return NOWHERE.matcher(redirect.group(1)).matches() ? null : redirect.group(1);
    }

    /** Ce que fait une commande simple ; null pour ce qui ne fait rien de notable ({@code cd}, {@code echo}). */
    static Nature partNature(String part) {
        List<String> words = new ArrayList<>();
        Matcher word = WORD.matcher(part);
        while (word.find()) words.add(word.group());
        int start = 0;
        while (start < words.size() && (ASSIGNMENT.matcher(words.get(start)).find() || WRAPPERS.contains(words.get(start)))) start++;
        String program = programOf(start < words.size() ? words.get(start) : "");
        List<String> args = start + 1 <= words.size() ? words.subList(start + 1, words.size()) : List.of();
        if (redirectTarget(part) != null) return Nature.CHANGE;
        if (program.isEmpty() || NOISE.contains(program)) return null;
        if (PACKAGE_MANAGERS.contains(program)) return packageNature(args);
        if ("git".equals(program)) return gitNature(args);
        if ("gh".equals(program)) return githubNature(args);
        if ("python".equals(program) || "python3".equals(program) || "py".equals(program)) return pythonNature(args);
        if ("node".equals(program) && args.contains("--test")) return Nature.TEST;
        if ("tsc".equals(program)) return args.contains("--noEmit") ? Nature.TEST : Nature.NEUTRAL;
        if (("prettier".equals(program) || "black".equals(program)) && args.contains("--check")) return Nature.TEST;
        if ("sed".equals(program) && args.stream().anyMatch(arg -> arg.startsWith("-i"))) return Nature.CHANGE;
        if ("touch".equals(program)) return Nature.CHANGE;
        Map<String, Nature> table = SUBCOMMANDS.get(program);
        if (table != null) {
            for (Map.Entry<String, Nature> sub : table.entrySet()) {
                if (args.contains(sub.getKey())) return sub.getValue();
            }
            return Nature.NEUTRAL;
        }
        return PROGRAMS.getOrDefault(program, Nature.NEUTRAL);
    }

    private static String programOf(String word) {
        String unquoted = QUOTED_ENDS.matcher(word).replaceAll("");
        String[] path = PATH_SEPARATOR.split(unquoted, -1);
        String last = path[path.length - 1].toLowerCase(Locale.ROOT);
        return EXECUTABLE.matcher(last).replaceFirst("");
    }

    private static Nature packageNature(List<String> args) {
        String script = args.isEmpty() ? null
            : "run".equals(args.get(0)) || "run-script".equals(args.get(0)) ? (args.size() > 1 ? args.get(1) : null) : args.get(0);
        if (script == null || INSTALL_SCRIPT.matcher(script).matches()) return Nature.NEUTRAL;
        if (TEST_SCRIPT.matcher(script).find() || CHECK_SCRIPT.matcher(script).find()) return Nature.TEST;
        return Nature.NEUTRAL;
    }

    private static Nature gitNature(List<String> args) {
        String sub = args.isEmpty() ? "" : args.get(0);
        if ("checkout".equals(sub) || "switch".equals(sub)) {
            return args.stream().anyMatch(arg -> BRANCH_FLAG.matcher(arg).matches()) ? Nature.CHANGE : Nature.NEUTRAL;
        }
        if ("branch".equals(sub)) return args.size() > 1 && !args.get(1).startsWith("-") ? Nature.CHANGE : Nature.READ;
        return GIT.getOrDefault(sub, Nature.NEUTRAL);
    }

    private static Nature githubNature(List<String> args) {
        if (args.size() > 1 && "pr".equals(args.get(0)) && "create".equals(args.get(1))) return Nature.CHANGE;
        return args.stream().anyMatch(arg -> GITHUB_READS.matcher(arg).matches()) ? Nature.READ : Nature.NEUTRAL;
    }

    private static Nature pythonNature(List<String> args) {
        int module = args.indexOf("-m");
        String launched = module >= 0 && module + 1 < args.size() ? args.get(module + 1) : null;
        if ("pytest".equals(launched) || "unittest".equals(launched)) return Nature.TEST;
        if ("mypy".equals(launched) || "ruff".equals(launched) || "flake8".equals(launched) || "pylint".equals(launched)) {
            return Nature.TEST;
        }
        return Nature.NEUTRAL;
    }

    private static Map<String, Nature> programs() {
        Map<String, Nature> programs = new LinkedHashMap<>();
        for (String p : List.of("vitest", "jest", "pytest", "mocha", "ava", "rspec", "phpunit", "ctest", "tox", "nox",
                "eslint", "ruff", "mypy", "flake8", "pylint", "biome")) programs.put(p, Nature.TEST);
        for (String p : List.of("ls", "dir", "tree", "pwd", "find", "fd", "cat", "head", "tail", "less", "more", "type", "wc",
                "stat", "file", "nl", "sed", "awk", "grep", "rg", "ag", "ack", "findstr")) programs.put(p, Nature.READ);
        for (String p : List.of("rm", "rmdir", "del", "unlink", "mv", "move", "ren", "rename", "cp", "copy", "xcopy", "rsync",
                "mkdir", "md")) programs.put(p, Nature.CHANGE);
        return Map.copyOf(programs);
    }

    /** Les outils à sous-commandes : le premier mot du tableau qui apparaît l'emporte, dans l'ordre du tableau. */
    private static Map<String, Map<String, Nature>> subcommands() {
        Map<String, Nature> maven = table("test", Nature.TEST, "verify", Nature.TEST, "package", Nature.NEUTRAL,
            "compile", Nature.NEUTRAL, "install", Nature.NEUTRAL);
        Map<String, Nature> gradle = table("test", Nature.TEST, "check", Nature.TEST, "build", Nature.NEUTRAL,
            "assemble", Nature.NEUTRAL);
        Map<String, Map<String, Nature>> tables = new LinkedHashMap<>();
        tables.put("mvn", maven);
        tables.put("mvnw", maven);
        tables.put("gradle", gradle);
        tables.put("gradlew", gradle);
        tables.put("go", table("test", Nature.TEST, "vet", Nature.TEST, "build", Nature.NEUTRAL));
        tables.put("cargo", table("test", Nature.TEST, "clippy", Nature.TEST, "check", Nature.TEST, "build", Nature.NEUTRAL,
            "fetch", Nature.NEUTRAL));
        tables.put("dotnet", table("test", Nature.TEST, "build", Nature.NEUTRAL, "restore", Nature.NEUTRAL));
        tables.put("make", table("test", Nature.TEST, "check", Nature.TEST, "build", Nature.NEUTRAL));
        tables.put("playwright", table("test", Nature.TEST));
        tables.put("cypress", table("run", Nature.TEST));
        tables.put("pip", table("install", Nature.NEUTRAL));
        tables.put("pip3", table("install", Nature.NEUTRAL));
        tables.put("poetry", table("install", Nature.NEUTRAL, "add", Nature.NEUTRAL));
        tables.put("uv", table("sync", Nature.NEUTRAL, "add", Nature.NEUTRAL, "pip", Nature.NEUTRAL));
        tables.put("bundle", table("install", Nature.NEUTRAL));
        tables.put("composer", table("test", Nature.TEST, "install", Nature.NEUTRAL, "require", Nature.NEUTRAL));
        return tables;
    }

    private static Map<String, Nature> table(Object... wordsAndNatures) {
        Map<String, Nature> table = new LinkedHashMap<>();
        for (int i = 0; i < wordsAndNatures.length; i += 2) table.put((String) wordsAndNatures[i], (Nature) wordsAndNatures[i + 1]);
        return table;
    }

    private static Map<String, Nature> git() {
        Map<String, Nature> git = new LinkedHashMap<>();
        for (String sub : List.of("status", "log", "diff", "show", "blame", "ls-files", "rev-parse", "remote", "fetch")) git.put(sub, Nature.READ);
        for (String sub : List.of("add", "commit", "push", "merge", "rebase", "pull", "reset", "restore", "stash", "cherry-pick",
                "revert", "apply", "am")) git.put(sub, Nature.CHANGE);
        return Map.copyOf(git);
    }
}
