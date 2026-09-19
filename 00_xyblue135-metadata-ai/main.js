/*
 * xyblue135 私人 · AI 元数据
 * 类型：xyblue135 私人插件（非公共发布版）
 * 说明：用户可见文案与维护注释已中文化；内部插件 ID 与 data.json 保持不变，以兼容原有设置和数据。
 */
/*
 * xyblue135-AI-Metadata for Obsidian
 * Author: xyblue135
 * v0.7.0
 *
 * Features:
 * - Inline AI buttons beside summary_short / summary_long / tags / technical_depth only for the root /00_docs whitelist.
 * - Up to N technically weighted tags (default cap 7), values only (no hierarchy); fewer valid tags are accepted.
 * - Maintains a local-only tag catalog from Markdown files under 00_docs/ (never sent to AI).
 * - Canonicalizes tag casing locally: existing Vault spelling first, built-in/editable technical spellings as fallback.
 * - Keeps only essential persistent state: optional per-field fingerprints and error diagnostics.
 * - Sequential API queue with a visible timeout (default 180s) and request gap (default 30s).
 * - Auto-refresh countdown starts only after the whole update cycle has finished.
 * - Folder-scoped pending dashboard with per-note previews, scope-drift protection, and stoppable sequential sync.
 * - JSON-mode structured replies, optional local JSON repair, one automatic structured-output retry, and raw-output diagnostics.
 * - Desktop status-bar progress/countdown while AI work is running.
 * - Editable/disableable harness constraints in Settings.
 */
const {
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  setIcon,
} = require("obsidian");

const LEGACY_SUMMARY_HARNESS_V056 = [
  "语言：中文。",
  "形式：单句摘要，直接概括核心知识。",
  "不要使用‘本文介绍了’、‘这篇笔记’等套话。",
  "不要 Markdown、不要引号、不要前后解释。",
  "摘要长度不得超过 {{summaryMaxChars}} 个字符。",
].join("\n");

const DEFAULT_SUMMARY_SHORT_HARNESS = [
  "语言：中文。",
  "用途：生成 summary_short，用于文章列表、搜索结果、悬浮预览和快速识别主题。",
  "形式：只输出一个自然、完整的单句摘要，不换行。",
  "内容：优先保留核心对象或技术主题、核心问题，以及最主要的解决方案、结论或知识点；保留最有辨识度的技术名词和关键参数，但不要展开完整排查过程。",
  "表达：必须是自然中文，不要写成电报体、日志体、参数串或关键词堆砌；不要为了压缩大量使用 /、+、→ 等符号代替正常语言关系。",
  "不要使用‘本文介绍了’、‘这篇文章讲了’、‘这篇笔记主要是’等套话；不要 Markdown、标题、引号或前后解释。",
  "长度：不得超过 {{summaryShortMaxChars}} 个字符；正文信息充足时，尽量使用上限的 70%～90%，但不要为了凑长度加入重复信息。",
].join("\n");

const DEFAULT_SUMMARY_LONG_HARNESS = [
  "语言：中文。",
  "用途：生成 summary_long，用于理解整篇文章结构，并服务于 AI 分类、技术含量判断、搜索、相关文章推荐、RAG 和文章排序。",
  "形式：输出一段自然、完整的内容摘要，可使用 2～3 个完整句子，但不要换行。",
  "目标：生成‘文章内容总览’，而不是最终结论、技术速记或参数清单；读者只阅读摘要，就应大致知道文章的背景问题、关键排查或分析过程、主要技术方案、涉及的重要技术点，以及最终结论、限制或待验证问题。",
  "内容要求：正文中存在时，应尽可能覆盖核心对象/背景问题、关键实验或测试数据、判断依据与因果关系、最终技术方案、关键参数/组件/接口/算法/工具，以及重要注意事项、风险、限制、异常现象或待验证问题。",
  "不要只写‘问题 + 最终方案’；如果正文包含排查、测试、选型、实现和风险分析，应尽量把这些阶段都压缩进摘要。",
  "优先保留具有检索价值和技术辨识度的具体信息，例如型号、技术名词、接口名称、关键数值、测试结果、核心模块和异常现象；不要用‘进行了测试’‘采用相关方法’等模糊概括替代具体内容。",
  "表达：使用自然、完整、连贯的中文叙述，不要写成电报体、日志体、关键词堆叠或参数串；避免大量使用 /、+、→ 等符号代替正常语言关系。允许使用‘针对……’‘通过……发现……’‘进一步……’‘同时……’等连接方式。",
  "不要使用‘本文介绍了’、‘这篇文章介绍了’、‘这篇笔记讲了’等空泛开场；不要 Markdown、标题、引号或前后解释。",
  "长度：不得超过 {{summaryLongMaxChars}} 个字符；正文信息充足时，尽量使用上限的 75%～95%；如果内容过多，优先压缩措辞，而不是删除关键技术阶段。",
  "禁止输出类似‘设备故障，测试A/B得出结论；使用模块X、Y完成改造，信号Z待验证’这种高度压缩的技术速记，必须改写成自然的文章概述。",
].join("\n");

const TAG_VALUE_SAFETY_PROTOCOL = [
  "标签 value 必须能直接作为本插件允许的 Obsidian tag value 使用。",
  "只允许：中文汉字、英文字母 A-Z/a-z、数字 0-9、下划线 _、连字符 -；并且标签不能是纯数字。",
  "禁止：空格、/、#、+、.、:、;、括号、引号及其他标点或特殊字符；不得输出层级标签。",
  "技术名词原名含非法字符时，必须转换为语义等价的合法标签，例如：B+树→BPlus树，C++→CPlusPlus，C#→CSharp，.NET→DotNet，Node.js→NodeJS。",
  "输出前逐个检查 value；任何不满足字符规则的候选都不要输出。",
].join("\n");

const LEGACY_TAGS_HARNESS_V042 = [
  "标签只保留 value，不使用 skill/Linux、domain/云计算 这类层级前缀。",
  "按与笔记内容的相关性给候选标签分配 weight，weight 越高越重要。",
  "优先复用标签目录中已有的稳定标签；同等相关时优先复用出现频率更高的标签。",
  "避免同义词、近义重复和过度宽泛的标签。",
  "请给出足够候选项，插件会按 weight 从高到低取前 {{maxTags}} 个。",
].join("\n");

const LEGACY_TAGS_HARNESS_V050 = [
  "最多输出 {{maxTags}} 个互不重复的标签 value；优先质量，不要为了凑数量加入泛化、重复或低信息量标签；不得使用 skill/Linux、domain/云计算 这类层级前缀。",
  "weight 主要表示‘技术专有性 + 对检索这篇笔记的区分度’，不是泛泛的主题相关度。",
  "具体技术实体优先高权重：软件/工具、框架、库、协议、API、算法、数据结构、数据库、系统组件、具体文件或媒体格式等，应优先于宽泛动作或用途词。",
  "当具体技术词和泛化概念表达相近时，具体技术词必须明显更高。例如 FFmpeg≈0.98，视频转码≈0.72，格式转换≈0.45；不要让‘格式转换’这类泛词压过 FFmpeg。",
  "建议权重层级：核心具体技术 0.90~1.00；具体机制/算法/协议/格式 0.80~0.94；明确任务或领域 0.60~0.79；泛化动作/用途 0.30~0.59。",
  "优先复用标签目录中的稳定标签，但复用频率只是同等质量时的次级因素，不能为了复用高频泛词而舍弃更具体的技术标签。",
  "避免同义词、近义重复、上下位概念重复占位；在最多 {{maxTags}} 个标签内尽量覆盖不同的高信息量技术维度。",
].join("\n");

const DEFAULT_TAGS_HARNESS = [
  "最多输出 {{maxTags}} 个互不重复的标签 value；优先质量，不要为了凑数量加入泛化、重复或低信息量标签；不得使用 skill/Linux、domain/云计算 这类层级前缀。",
  "weight 主要表示‘技术专有性 + 对检索这篇笔记的区分度’，不是泛泛的主题相关度。",
  "具体技术实体优先高权重：软件/工具、框架、库、协议、API、算法、数据结构、数据库、系统组件、具体文件或媒体格式等，应优先于宽泛动作或用途词。",
  "当具体技术词和泛化概念表达相近时，具体技术词必须明显更高。例如 FFmpeg≈0.98，视频转码≈0.72，格式转换≈0.45；不要让‘格式转换’这类泛词压过 FFmpeg。",
  "建议权重层级：核心具体技术 0.90~1.00；具体机制/算法/协议/格式 0.80~0.94；明确任务或领域 0.60~0.79；泛化动作/用途 0.30~0.59。",
  "避免同义词、近义重复、上下位概念重复占位；在最多 {{maxTags}} 个标签内尽量覆盖不同的高信息量技术维度。",
].join("\n");

const DEFAULT_TECHNICAL_DEPTH_HARNESS = `你是一名技术内容评审员。请完整阅读下面提供的技术文章全文，对文章本身的“技术深度（technical_depth）”进行评分。

## 评分目标

technical_depth 衡量的是：

文章本身涉及的技术机制深度、工程实现复杂度、系统复杂度、分析验证强度以及所需前置知识密度。

它不是：

* 文章写得好不好
* 文章字数多少
* 教程是否详细
* 对某个特定读者来说难不难
* 文章是否有很多代码、命令或截图
* 文章是否有很多专业术语

因此：

一篇非常详细的软件安装教程、命令大全、工具使用说明，即使有上万字，也可能只有 10～35 分。

一篇只有两三千字，但真正分析了协议、内核、编译器、数据库内部机制、分布式一致性、性能瓶颈或复杂故障根因的文章，可以达到 60～85 分。

## 总分

technical_depth 为 0～100 的整数。

不要根据当前文章集合进行归一化。

不要把“当前最难文章”强行设置为 100。

100 分代表固定的专家级/研究级技术深度，因此绝大多数普通技术博客都不应该达到 90 分以上。

## 五个评分维度

### 1. 机制深度：0～28 分

判断文章是否真正解释“为什么”和“内部如何工作”。

重点包括：

* 底层原理
* 内部机制
* 数据结构
* 算法
* 协议
* 内核行为
* 调度机制
* 编译过程
* 存储机制
* 网络机制
* 分布式机制
* 数据流或控制流
* 源码级行为

仅告诉读者“执行什么命令”“在哪里点击”“修改什么配置”，不能获得高机制分。

### 2. 工程实现：0～24 分

判断文章是否包含真实、有复杂度的技术实现。

重点包括：

* 多组件协作
* 完整部署
* 架构搭建
* 编译
* 二次开发
* 复杂配置
* 自动化
* 系统集成
* 源码修改
* 性能调优
* 工程取舍

注意：

大量复制粘贴命令并不等于工程复杂度高。

单纯安装软件、配置环境变量、启动服务、修改少量配置文件，应限制在较低分数。

### 3. 分析与验证：0～19 分

判断文章是否形成真正的技术分析闭环。

例如：

现象
→ 收集证据
→ 提出假设
→ 日志/抓包/性能指标/源码分析
→ 排除错误方向
→ 定位根因
→ 修改方案
→ 再次验证

以下内容可以提高本项评分：

* benchmark
* 性能测试
* A/B 对比
* Wireshark
* tcpdump
* perf
* strace
* 日志分析
* 实验
* 指标变化
* 故障复现
* 多方案比较

如果文章只是给出最终解决办法，没有分析过程，本项不要给高分。

### 4. 系统复杂度：0～17 分

判断问题涉及多少技术层次以及它们之间是否存在真实关联。

例如：

应用
→ 中间件
→ 操作系统
→ 网络协议
→ 驱动
→ 硬件

或者：

客户端
→ 网关
→ 服务发现
→ Raft
→ 存储
→ 网络

跨组件、跨系统、跨层分析通常比单一工具的使用具有更高技术深度。

但不要因为文章提到了很多产品名称就自动加分，必须存在实际技术关系。

### 5. 前置知识密度：0～12 分

判断读者真正理解文章需要多少技术基础。

例如需要理解：

* 操作系统
* 网络
* 数据库
* 数据结构
* 编译原理
* 分布式系统
* GPU/CUDA
* 存储
* Linux 内核
* 数学或机器学习理论

单纯因为术语很多，不代表前置知识密度高。

## 分数区间标准

### 0～19：基础信息 / 简单操作

典型内容：

* 单个命令说明
* 软件是什么
* 简单参数说明
* 基础知识点
* 简单问题记录
* UI 操作
* 软件安装步骤

### 20～39：基础技术教程

典型内容：

* 常规 Linux 教程
* Docker 基础操作
* 普通软件部署
* 基本配置
* 常见故障解决
* API 基础使用
* 比较完整但机制较浅的教程

文章可以写得非常完整，但核心仍然是“怎么使用”。

### 40～59：中等技术深度

典型内容：

* 开始解释内部机制
* 多组件配置
* 较复杂部署
* 有一定故障分析
* 比较深入的数据库、Linux、网络、Docker/Kubernetes 教程
* 带有部分原理和验证的工程实践

### 60～74：高级技术

典型内容：

* 系统级故障排查
* 完整性能分析
* 跨组件问题
* 编译与复杂构建
* 分布式系统机制
* 网络底层问题
* 存储内部机制
* 有明显“证据 → 根因 → 修复 → 验证”的分析闭环

### 75～89：深度技术

典型内容：

* 跨多个技术层
* 深入底层机制
* 源码级或协议级分析
* 高复杂度工程实现
* 性能实验充分
* 多种工具联合定位
* 有较强技术取舍分析
* 接近高级工程师/专家经验总结

### 90～99：专家 / 研究级

只有在文章同时具备多数以下特征时使用：

* 很强的机制深度
* 源码或算法层分析
* 高复杂度系统问题
* 严格实验或性能验证
* 多方案比较
* 明确技术权衡
* 较强原创分析
* 对已有方法有改进或新的工程发现

不要因为文章“看起来很厉害”就给 90+。

### 100

极少使用。

代表非常完整的专家级或研究级技术成果，通常已经接近：

* 高质量研究论文
* 极深入的原创系统研究
* 完整架构设计 + 底层实现 + 实验验证
* 对复杂技术问题具有明显原创贡献

普通博客不需要存在 100 分文章。

## 特别需要防止的误判

### 长文章不等于高分

50000 字的命令参考手册，可能只有 25～40 分。

### 代码多不等于高分

大量 Shell、YAML、Docker Compose 或配置文件只是实现步骤时，不应该自动获得高分。

### 安装复杂不等于技术深

“安装了很多依赖、踩了很多环境问题”不代表文章达到高级技术深度。

### 专业术语多不等于高分

必须确认文章真正解释或使用了这些机制。

### 知识类文章写得很好也不等于技术深

如果主要是概念介绍、历史介绍、软件介绍、基础科普，应保持较低到中等评分。

### 短文章也可能高分

如果短文章准确解释了一个非常深入的核心机制，可以获得较高分数。

## 评分要求

阅读全文后再评分，不要只根据标题、摘要或开头判断。

先在内部完成五个维度的判断，然后得到最终 technical_depth。

最终分数必须是整数。

相邻文章之间不必人为拉开差距；如果技术深度相近，可以得到相同分数。

不要为了让分布看起来漂亮而修改分数。

## 输出格式

只输出以下 JSON，不要 Markdown，不要解释，不要添加任何其他文字：

{
"technical_depth": 68,
"mechanism_depth": 20,
"engineering_depth": 17,
"analysis_validation": 13,
"system_complexity": 10,
"prerequisite_density": 8,
"reason": "一句话说明为什么得到这个分数"
}

其中五个维度之和必须严格等于 technical_depth。

reason 控制在 80 个汉字以内，重点说明决定该文章技术深度的主要原因，不要复述标题。

下面是需要评分的文章全文：

{{ARTICLE}}`;

const DEFAULT_TECHNICAL_TAG_CANONICAL_LIST = [
  "Linux",
  "Prometheus",
  "Grafana",
  "Docker",
  "Kubernetes",
  "K8s",
  "Nginx",
  "MySQL",
  "PostgreSQL",
  "Redis",
  "MongoDB",
  "Git",
  "GitHub",
  "GitLab",
  "Jenkins",
  "Ansible",
  "Terraform",
  "Python",
  "Java",
  "JavaScript",
  "TypeScript",
  "NodeJS",
  "React",
  "Vue",
  "Angular",
  "Spring",
  "SpringBoot",
  "OpenAI",
  "ChatGPT",
  "Obsidian",
  "Selenium",
  "FFmpeg",
  "Fluent",
  "Unity",
  "YOLO",
  "PyTorch",
  "TensorFlow",
  "CUDA",
  "OpenCV",
  "NumPy",
  "Pandas",
  "ScikitLearn",
  "REST",
  "HTTP",
  "HTTPS",
  "TCP",
  "UDP",
  "DNS",
  "SSH",
  "TLS",
  "JSON",
  "YAML",
  "XML",
  "HTML",
  "CSS",
  "SQL",
  "NoSQL",
  "API",
  "SDK",
  "CI",
  "CD",
  "DevOps",
  "MLOps",
  "LLM",
  "RAG",
  "Nacos",
  "Zabbix",
  "Loki",
  "Promtail",
  "SkyWalking",
].join("\n");

const DEFAULT_QA_HARNESS = `语言：中文。
用途：基于本笔记正文生成 {{maxQuestions}} 道面试题，用于面试自测复习。
形式：输出 Q/A 交替的纯文本，不要 Markdown、代码块、标题或额外解释；每题格式固定为：
Q: <问题>
A: <答案>

每道题之间空一行。问题要具体、有区分度，优先覆盖正文的核心对象、关键技术点、原理机制、配置/排查要点和易错点；答案要精炼、口语化、可直接用于面试作答，不要大段复述原文。不要编造正文没有的内容。`;

const DEFAULT_AI_TITLE_HARNESS = `语言：中文。
用途：基于本笔记正文生成 {{maxItems}} 个参考性文章标题，供用户挑选，并便于后续 RAG 检索。
形式：只输出纯文本标题列表，每行一个标题，不要序号、Markdown 列表符号、代码块、标题或额外解释。
要求：标题要准确反映正文主题与关键信息，风格多样（可包含直述式、设问式、数字式等），彼此区分明显；不要编造正文没有的内容。`;

const DEFAULT_SETTINGS = {
  baseUrl: "http://192.168.3.101:3001/v1",
  apiKey: "",
  model: "auto",
  whitelistFolder: "00_docs",
  summaryShortMaxChars: 100,
  summaryLongMaxChars: 300,
  summaryMarkdownCleanupEnabled: false,
  contentFingerprintEnabled: false,
  maxTags: 7,
  autoUpdateEnabled: false,
  autoUpdateMinutes: 60,
  statusDoneOnlyEnabled: false,
  requestTimeoutSeconds: 180,
  requestIntervalSeconds: 30,
  experimentalCombinedRequestEnabled: true,
  structuredJsonModeEnabled: true,
  jsonRepairEnabled: true,
  statusBarEnabled: true,
  summaryShortHarnessEnabled: true,
  summaryLongHarnessEnabled: true,
  tagsHarnessEnabled: true,
  technicalDepthHarnessEnabled: true,
  tagCaseNormalizationEnabled: true,
  technicalTagCanonicalList: DEFAULT_TECHNICAL_TAG_CANONICAL_LIST,
  summaryShortHarness: DEFAULT_SUMMARY_SHORT_HARNESS,
  summaryLongHarness: DEFAULT_SUMMARY_LONG_HARNESS,
  tagsHarness: DEFAULT_TAGS_HARNESS,
  technicalDepthHarness: DEFAULT_TECHNICAL_DEPTH_HARNESS,
  qaHarnessEnabled: true,
  qaMaxQuestions: 5,
  qaHarness: DEFAULT_QA_HARNESS,
  aiTitleHarnessEnabled: true,
  aiTitleMaxItems: 5,
  aiTitleHarness: DEFAULT_AI_TITLE_HARNESS,
};

const DEFAULT_STATE = {
  files: {},
  // 仅运行期缓存：Tag Catalog 每次启动后从 Vault 重建，不再持久化到 data.json。
  tagCatalog: {},
};

class EmptyNoteBodyError extends Error {
  constructor(message = "笔记正文为空", fingerprint = "") {
    super(message);
    this.name = "EmptyNoteBodyError";
    this.code = "EMPTY_BODY";
    this.fingerprint = fingerprint;
  }
}

class StructuredOutputError extends Error {
  constructor(message, rawOutput = "", extra = {}) {
    super(message);
    this.name = "StructuredOutputError";
    this.code = "STRUCTURED_OUTPUT";
    this.rawOutput = String(rawOutput || "");
    this.repairAttempted = extra.repairAttempted === true;
    this.repairSucceeded = extra.repairSucceeded === true;
    this.repairedText = String(extra.repairedText || "");
    this.attempts = Array.isArray(extra.attempts) ? extra.attempts : [];
  }
}

class TaskCancelledError extends Error {
  constructor(message = "任务已由用户停止") {
    super(message);
    this.name = "TaskCancelledError";
    this.code = "TASK_CANCELLED";
  }
}

class FileLeftScopeError extends Error {
  constructor(path, folder) {
    super(`任务执行期间文件已移出当前识别目录：${path}`);
    this.name = "FileLeftScopeError";
    this.code = "FILE_LEFT_SCOPE";
    this.path = path;
    this.folder = folder;
  }
}

module.exports = class AiMetadataPlugin extends Plugin {
  async onload() {
    const saved = (await this.loadData()) || {};
    // v0.1 将设置直接存储在根级；v0.2 改为 {settings, state} 结构。
    const savedSettings = saved.settings || saved;
    const savedState = saved.state || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings);

    // v0.6.0：从单 summary 升级为 summary_short + summary_long。
    // 旧 summaryMaxChars <= 140 时视为“短摘要长度”；>= 180 时视为“长摘要长度”。
    // 不自动改写 Vault 内原有 summary 字段，避免升级时静默批量改笔记；新流程会维护两个新字段。
    const legacySummaryMaxChars = Number(savedSettings.summaryMaxChars);
    if (savedSettings.summaryShortMaxChars === undefined) {
      this.settings.summaryShortMaxChars = Number.isFinite(legacySummaryMaxChars) && legacySummaryMaxChars >= 40 && legacySummaryMaxChars <= 140
        ? legacySummaryMaxChars
        : DEFAULT_SETTINGS.summaryShortMaxChars;
    }
    if (savedSettings.summaryLongMaxChars === undefined) {
      this.settings.summaryLongMaxChars = Number.isFinite(legacySummaryMaxChars) && legacySummaryMaxChars >= 180
        ? Math.min(1000, legacySummaryMaxChars)
        : DEFAULT_SETTINGS.summaryLongMaxChars;
    }
    if (savedSettings.summaryShortHarnessEnabled === undefined) {
      this.settings.summaryShortHarnessEnabled = savedSettings.summaryHarnessEnabled !== false;
    }
    if (savedSettings.summaryLongHarnessEnabled === undefined) {
      this.settings.summaryLongHarnessEnabled = savedSettings.summaryHarnessEnabled !== false;
    }
    if (!savedSettings.summaryShortHarness) this.settings.summaryShortHarness = DEFAULT_SUMMARY_SHORT_HARNESS;
    if (!savedSettings.summaryLongHarness) this.settings.summaryLongHarness = DEFAULT_SUMMARY_LONG_HARNESS;
    delete this.settings.summaryMaxChars;
    delete this.settings.summaryHarness;
    delete this.settings.summaryHarnessEnabled;
    // v0.4.4 移除旧版“手动批量数量”数值控制项。
    delete this.settings.manualBatchSize;
    // 仅升级仍保持 v0.4.2 默认值的 Harness；如果用户已自定义，则原样保留。
    if (!savedSettings.tagsHarness
      || savedSettings.tagsHarness === LEGACY_TAGS_HARNESS_V042
      || savedSettings.tagsHarness === LEGACY_TAGS_HARNESS_V050) {
      this.settings.tagsHarness = DEFAULT_TAGS_HARNESS;
    }
    if (!savedSettings.technicalTagCanonicalList) {
      this.settings.technicalTagCanonicalList = DEFAULT_TECHNICAL_TAG_CANONICAL_LIST;
    }
    // v0.7.0：新增 technical_depth。只新增默认评分 Prompt，不改写既有文章。
    if (savedSettings.technicalDepthHarnessEnabled === undefined) this.settings.technicalDepthHarnessEnabled = true;
    if (!savedSettings.technicalDepthHarness) this.settings.technicalDepthHarness = DEFAULT_TECHNICAL_DEPTH_HARNESS;
    if (savedSettings.qaHarnessEnabled === undefined) this.settings.qaHarnessEnabled = true;
    if (!savedSettings.qaHarness) this.settings.qaHarness = DEFAULT_QA_HARNESS;
    if (savedSettings.aiTitleHarnessEnabled === undefined) this.settings.aiTitleHarnessEnabled = true;
    if (!savedSettings.aiTitleHarness) this.settings.aiTitleHarness = DEFAULT_AI_TITLE_HARNESS;
    this.state = Object.assign({}, DEFAULT_STATE);
    this.state.files = this.loadPersistedFileState(savedState.files || {});
    // Tag Catalog 只存在于当前运行内存中，避免普通编辑/Tag 扫描反复改写 data.json。
    this.state.tagCatalog = {};
    // 记录原始磁盘内容签名；首次 saveAllData() 会自动清理旧版运行状态字段。
    this.lastPersistedDataSignature = JSON.stringify(saved);

    // v0.6.0：旧版 lastSummaryHash 不再代表两个新摘要字段，统一移除，避免把旧 summary 误判为双摘要均已完成。
    for (const record of Object.values(this.state.files)) {
      if (!record || typeof record !== "object") continue;
      delete record.lastSummaryHash;
    }

    // v0.5.6：内容指纹识别改为可选功能。关闭时删除旧版持久化 hash 标记，
    // 让数据库不再依赖内容指纹。
    if (this.settings.contentFingerprintEnabled !== true) {
      this.clearPersistentFingerprintMarkers();
    }
    // v0.6.1：无论 fingerprint 是否开启，都执行一次轻量迁移。
    // 旧版 tagCatalog / updateLog / lastChangedAt 等运行状态会从 data.json 中清除；
    // 若迁移前后内容完全一致，则 saveAllData() 会自动跳过落盘。
    await this.saveAllData();

    this.observer = null;
    this.injectTimer = null;
    this.catalogTimer = null;
    this.saveTimer = null;
    this.autoTimeoutId = null;
    this.nextAutoRunAt = 0;
    this.autoRunning = false;
    this.cycleMode = null;
    this.autoRunController = null;
    this.fileBusy = new Set();
    this.unloading = false;
    this.lifecycleToken = 1;
    this.apiQueue = Promise.resolve();
    this.lastApiCompletedAt = 0;
    this.activeHttpRequests = new Set();
    this.manualFolderRun = null;
    this.runtimeStatus = { mode: "idle" };
    this.lastCycleSummary = "";

    this.statusBarItem = this.addStatusBarItem();
    if (this.statusBarItem) {
      this.statusBarItem.addClass("ai-metadata-statusbar");
      this.statusBarItem.addEventListener("click", () => {
        new Notice(this.getStatusBarTooltip(), 5000);
      });
    }
    this.statusTickerId = window.setInterval(() => this.refreshStatusBar(), 1000);
    this.registerInterval(this.statusTickerId);
    this.refreshStatusBar();

    this.addSettingTab(new AiMetadataSettingTab(this.app, this));

    this.addCommand({
      id: "generate-summary",
      name: "为当前 00_docs 笔记生成长摘要 AI_summary_long",
      callback: () => void this.generateForActiveFile("summary_long"),
    });
    this.addCommand({
      id: "generate-summary-short",
      name: "为当前 00_docs 笔记生成短摘要 AI_summary_short",
      callback: () => void this.generateForActiveFile("summary_short"),
    });
    this.addCommand({
      id: "generate-both-summaries",
      name: "为当前 00_docs 笔记同时生成短摘要和长摘要",
      callback: () => void this.generateForActiveFile("summaries"),
    });
    this.addCommand({
      id: "generate-tags",
      name: "为当前 00_docs 笔记生成加权标签",
      callback: () => void this.generateForActiveFile("tags"),
    });
    this.addCommand({
      id: "generate-technical-depth",
      name: "为当前 00_docs 笔记评估技术深度 AI_technical_depth",
      callback: () => void this.generateForActiveFile("technical_depth"),
    });
    this.addCommand({
      id: "generate-qa",
      name: "为当前 00_docs 笔记生成面试问答 AI_qa",
      callback: () => void this.generateForActiveFile("qa"),
    });
    this.addCommand({
      id: "generate-title",
      name: "为当前 00_docs 笔记生成参考标题 AI_title",
      callback: () => void this.generateForActiveFile("ai_title"),
    });
    this.addCommand({
      id: "generate-summary-and-tags",
      name: "为当前 00_docs 笔记生成 6 项 AI 元数据",
      callback: () => void this.generateForActiveFile("all"),
    });
    this.addCommand({
      id: "toggle-auto-update",
      name: "切换 AI 元数据自动更新",
      callback: async () => {
        await this.setAutoUpdateEnabled(!this.settings.autoUpdateEnabled, { showNotice: true });
      },
    });
    this.addCommand({
      id: "open-pending-notes-dashboard",
      name: "打开待更新元数据笔记面板",
      callback: () => this.openPendingNotesDashboard(),
    });

    this.app.workspace.onLayoutReady(() => {
      this.startObserver();
      this.scheduleInjection();
      this.scheduleTagCatalogRebuild(250);
      this.restartAutoScheduler();
    });

    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.scheduleInjection()));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.scheduleInjection()));

    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (file instanceof TFile && file.extension === "md" && this.isWhitelisted(file)) {
        // 普通编辑只刷新运行期 Tag Catalog；不记录时间戳/日志，也不写 data.json。
        this.scheduleTagCatalogRebuild(1200);
      }
    }));

    this.registerEvent(this.app.vault.on("create", (file) => {
      if (file instanceof TFile && file.extension === "md" && this.isWhitelisted(file)) {
        this.scheduleTagCatalogRebuild(1200);
      }
    }));

    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (file && file.path && this.state.files[file.path]) {
        delete this.state.files[file.path];
        this.scheduleStateSave();
      }
      this.scheduleTagCatalogRebuild(800);
    }));

    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (this.state.files[oldPath]) {
        this.state.files[file.path] = this.state.files[oldPath];
        delete this.state.files[oldPath];
        this.scheduleStateSave();
      }
      this.scheduleInjection();
      this.scheduleTagCatalogRebuild(800);
    }));

    // 监听 metadata cache 变化，用于捕获 Obsidian 解析完成后的 Tag 修改。
    if (this.app.metadataCache && typeof this.app.metadataCache.on === "function") {
      this.registerEvent(this.app.metadataCache.on("changed", (file) => {
        if (file instanceof TFile && file.extension === "md" && this.isWhitelisted(file)) {
          this.scheduleTagCatalogRebuild(500);
        }
      }));
    }
  }

  onunload() {
    if (this.observer) this.observer.disconnect();
    this.observer = null;
    if (this.injectTimer !== null) window.clearTimeout(this.injectTimer);
    if (this.catalogTimer !== null) window.clearTimeout(this.catalogTimer);
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.unloading = true;
    this.lifecycleToken += 1;
    if (this.autoTimeoutId !== null) window.clearTimeout(this.autoTimeoutId);
    this.autoTimeoutId = null;
    this.nextAutoRunAt = 0;
    if (this.autoRunController) {
      try { this.autoRunController.abort(); } catch (_) {}
      this.autoRunController = null;
    }
    for (const req of this.activeHttpRequests || []) {
      try { req.destroy(new Error("Obsidian/plugin closed")); } catch (_) {}
    }
    if (this.activeHttpRequests) this.activeHttpRequests.clear();
    document.querySelectorAll(".ai-metadata-property-button").forEach((el) => el.remove());
    document.querySelectorAll(".ai-metadata-enabled-row").forEach((el) => el.removeClass("ai-metadata-enabled-row"));
  }

  loadPersistedFileState(savedFiles) {
    const files = {};
    const fingerprintEnabled = this.settings.contentFingerprintEnabled === true;
    for (const [path, source] of Object.entries(savedFiles || {})) {
      if (!source || typeof source !== "object") continue;
      const record = {};
      if (fingerprintEnabled) {
        for (const key of ["lastSummaryShortHash", "lastSummaryLongHash", "lastTagsHash", "lastTechnicalDepthHash"]) {
          if (typeof source[key] === "string" && source[key]) record[key] = source[key];
        }
      }
      for (const key of ["lastError", "lastErrorType", "lastRawModelOutput"]) {
        if (typeof source[key] === "string" && source[key]) record[key] = source[key];
      }
      if (Object.keys(record).length) files[path] = record;
    }
    return files;
  }

  buildPersistedState() {
    const files = {};
    const fingerprintEnabled = this.settings.contentFingerprintEnabled === true;
    for (const [path, source] of Object.entries(this.state.files || {})) {
      if (!source || typeof source !== "object") continue;
      const record = {};
      if (fingerprintEnabled) {
        for (const key of ["lastSummaryShortHash", "lastSummaryLongHash", "lastTagsHash", "lastTechnicalDepthHash"]) {
          if (typeof source[key] === "string" && source[key]) record[key] = source[key];
        }
      }
      for (const key of ["lastError", "lastErrorType", "lastRawModelOutput"]) {
        if (typeof source[key] === "string" && source[key]) record[key] = source[key];
      }
      if (Object.keys(record).length) files[path] = record;
    }
    return { files };
  }

  async saveAllData() {
    const payload = { settings: this.settings, state: this.buildPersistedState() };
    const signature = JSON.stringify(payload);
    if (signature === this.lastPersistedDataSignature) return false;
    await this.saveData(payload);
    this.lastPersistedDataSignature = signature;
    return true;
  }

  scheduleStateSave(delay = 400) {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.saveAllData();
    }, delay);
  }


  ensureLifecycleActive() {
    if (this.unloading) throw new Error("插件正在卸载，本次 AI 结果不会写入");
  }

  ensureTaskActive(signal = null) {
    this.ensureLifecycleActive();
    if (signal && signal.aborted) throw new TaskCancelledError();
  }

  isPathInsideFolder(filePath, folderPath) {
    const path = String(filePath || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    const folder = this.normalizeFolderPath(folderPath);
    return !!path && path.startsWith(`${folder}/`);
  }

  assertFileStillInFolder(file, folderPath) {
    const currentPath = file && file.path ? file.path : "";
    const currentFile = currentPath ? this.app.vault.getAbstractFileByPath(currentPath) : null;
    if (!(currentFile instanceof TFile) || currentFile !== file) {
      const error = new Error(`任务执行期间文件已删除或被替换：${currentPath || "未知路径"}`);
      error.code = "FILE_UNAVAILABLE";
      throw error;
    }
    if (!this.isPathInsideFolder(currentPath, folderPath)) {
      throw new FileLeftScopeError(currentPath, this.normalizeFolderPath(folderPath));
    }
  }

  stopPendingFolderRun(folderPath = null) {
    const run = this.manualFolderRun;
    if (!run || !run.controller || run.controller.signal.aborted) return false;
    if (folderPath && this.normalizeFolderPath(folderPath) !== run.folder) return false;
    run.controller.abort();
    this.setRuntimeStatus("stopping", { phase: `停止 ${run.folder}` });
    return true;
  }

  setRuntimeStatus(mode, data = {}) {
    this.runtimeStatus = Object.assign({ mode }, data);
    this.refreshStatusBar();
  }

  formatRemaining(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    if (minutes > 0) return `${minutes}:${String(seconds).padStart(2, "0")}`;
    return `${seconds}s`;
  }

  getStatusBarTooltip() {
    const status = this.runtimeStatus || { mode: "idle" };
    const timeout = Math.max(1, Number(this.settings.requestTimeoutSeconds) || 180);
    const gap = Math.max(0, Number(this.settings.requestIntervalSeconds) || 30);
    const combinedMode = this.settings.experimentalCombinedRequestEnabled === true ? "实验合并：开" : "实验合并：关";
    const lines = [`xyblue135 私人·AI 元数据 · 超时 ${timeout}s · 请求间隔 ${gap}s · ${combinedMode}`];
    if (status.filePath) lines.push(`当前：${status.filePath}`);
    if (status.phase) lines.push(`阶段：${status.phase}`);
    if (this.lastCycleSummary) lines.push(this.lastCycleSummary);
    if (this.settings.autoUpdateEnabled && this.nextAutoRunAt > 0) {
      lines.push(`下次自动检查：${this.formatRemaining(this.nextAutoRunAt - Date.now())}`);
    } else if (!this.settings.autoUpdateEnabled) {
      lines.push("自动更新：已关闭");
    }
    return lines.join("\n");
  }

  refreshStatusBar() {
    if (!this.statusBarItem) return;
    const enabled = this.settings.statusBarEnabled !== false;
    this.statusBarItem.toggleClass("is-hidden", !enabled);
    if (!enabled) return;

    const status = this.runtimeStatus || { mode: "idle" };
    let text = "AI：空闲";
    const progress = status.progress && Number.isFinite(status.progress.index)
      ? `${status.progress.index}/${status.progress.total} `
      : "";
    const name = status.filePath ? status.filePath.split("/").pop() : "";

    if (status.mode === "requesting") {
      text = `AI：${progress}${status.phase || "请求"}${name ? ` · ${name}` : ""}`;
    } else if (status.mode === "waiting") {
      const remaining = Math.max(0, Number(status.waitUntil || 0) - Date.now());
      text = `AI：等待 ${this.formatRemaining(remaining)} → ${status.phase || "下一请求"}${name ? ` · ${name}` : ""}`;
    } else if (status.mode === "writing") {
      text = `AI：${progress}写入 ${status.phase || "metadata"}${name ? ` · ${name}` : ""}`;
    } else if (status.mode === "error") {
      text = `AI：失败${name ? ` · ${name}` : ""}`;
    } else if (status.mode === "stopping") {
      text = "AI：正在停止…";
    } else if (this.autoRunning) {
      if (this.cycleMode === "manual-folder") text = "AI：文件夹同步中";
      else if (this.cycleMode === "manual-full") text = "AI：手动扫描处理中";
      else text = "AI：自动扫描中";
    } else if (!this.settings.autoUpdateEnabled) {
      text = "AI：自动更新已关闭";
    } else if (this.nextAutoRunAt > 0) {
      text = `AI：下次检查 ${this.formatRemaining(this.nextAutoRunAt - Date.now())}`;
    }

    this.statusBarItem.setText(text);
    this.statusBarItem.setAttribute("aria-label", this.getStatusBarTooltip());
    this.statusBarItem.setAttribute("title", this.getStatusBarTooltip());
  }

  async waitForApiGap(context = {}) {
    this.ensureTaskActive(context.abortSignal);
    const gapMs = Math.max(0, Number(this.settings.requestIntervalSeconds) || 0) * 1000;
    if (!this.lastApiCompletedAt || gapMs <= 0) return;
    const waitMs = this.lastApiCompletedAt + gapMs - Date.now();
    if (waitMs <= 0) return;
    const waitUntil = Date.now() + waitMs;
    this.setRuntimeStatus("waiting", { ...context, waitUntil });
    await this.sleep(waitMs, context.abortSignal);
    this.ensureTaskActive(context.abortSignal);
  }

  enqueueApiRequest(task, context = {}) {
    const run = async () => {
      this.ensureTaskActive(context.abortSignal);
      await this.waitForApiGap(context);
      this.ensureTaskActive(context.abortSignal);
      this.setRuntimeStatus("requesting", context);
      try {
        return await task();
      } finally {
        this.lastApiCompletedAt = Date.now();
      }
    };
    const result = this.apiQueue.then(run, run);
    this.apiQueue = result.catch(() => undefined);
    return result;
  }

  normalizeWhitelistFolder() {
    return String(this.settings.whitelistFolder || "00_docs")
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\/+|\/+$/g, "") || "00_docs";
  }

  isWhitelisted(file) {
    if (!(file instanceof TFile) || file.extension !== "md") return false;
    const root = this.normalizeWhitelistFolder();
    return file.path.startsWith(`${root}/`);
  }

  getNotesFiles() {
    return this.app.vault.getMarkdownFiles().filter((file) => this.isWhitelisted(file));
  }

  getMetadataStatus(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const value = cache?.frontmatter?.status;
    if (Array.isArray(value)) {
      return value.length ? String(value[0] ?? "").trim().toLocaleLowerCase("en-US") : "";
    }
    return String(value ?? "").trim().toLocaleLowerCase("en-US");
  }

  isRecognitionEligible(file) {
    if (!this.isWhitelisted(file)) return false;
    if (this.settings.statusDoneOnlyEnabled !== true) return true;
    return this.getMetadataStatus(file) === "done";
  }

  getRecognitionFiles() {
    return this.getNotesFiles().filter((file) => this.isRecognitionEligible(file));
  }

  assertRecognitionEligible(file) {
    if (this.settings.statusDoneOnlyEnabled !== true) return;
    const status = this.getMetadataStatus(file);
    if (status === "done") return;
    const error = new Error(`文章 status 当前为 ${status || "未设置"}，已按规则跳过`);
    error.code = "STATUS_NOT_DONE";
    throw error;
  }

  startObserver() {
    if (this.observer) return;
    this.observer = new MutationObserver(() => this.scheduleInjection());
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.register(() => this.observer && this.observer.disconnect());
  }

  scheduleInjection() {
    if (this.injectTimer !== null) window.clearTimeout(this.injectTimer);
    this.injectTimer = window.setTimeout(() => {
      this.injectTimer = null;
      this.injectButtons();
    }, 80);
  }

  clearInjectedButtons() {
    document.querySelectorAll(".ai-metadata-property-button").forEach((el) => el.remove());
    document.querySelectorAll(".ai-metadata-enabled-row").forEach((el) => el.removeClass("ai-metadata-enabled-row"));
  }

  injectButtons() {
    const file = this.app.workspace.getActiveFile();
    if (!(file instanceof TFile) || !this.isWhitelisted(file)) {
      this.clearInjectedButtons();
      return;
    }

    // 只向当前活动工作区叶节点注入按钮，避免按钮误操作其他已打开笔记。
    const scope = document.querySelector(".workspace-leaf.mod-active") || document;
    document.querySelectorAll(".ai-metadata-property-button").forEach((button) => {
      if (!scope.contains(button)) {
        const row = button.closest(".metadata-property");
        if (row) row.removeClass("ai-metadata-enabled-row");
        button.remove();
      }
    });
    ["summary_short", "summary_long", "tags", "technical_depth", "qa", "ai_title"].forEach((kind) => {
      const rows = this.findPropertyRows(kind, scope);
      rows.forEach((row) => {
        if (row.querySelector(`.ai-metadata-property-button[data-ai-kind="${kind}"]`)) return;
        row.addClass("ai-metadata-enabled-row");
        // Properties 行内按钮固定为单字段操作；批量、自动或 all 操作仍可使用 Beta 四项元数据单请求路径，但单字段按钮绝不顺带修改另一个字段。
        const button = row.createEl("button", {
          cls: "ai-metadata-property-button clickable-icon",
          attr: {
            "aria-label": kind === "summary_short"
              ? "AI 只生成 AI_summary_short"
              : kind === "summary_long"
                ? "AI 只生成 AI_summary_long"
                : kind === "tags"
                  ? "AI 只生成 weighted tags"
                  : kind === "technical_depth"
                    ? "AI 只评估 AI_technical_depth"
                    : kind === "qa"
                      ? "AI 只生成面试问答 AI_qa"
                      : "AI 只生成参考标题 AI_title",
            "data-ai-kind": kind,
            type: "button",
          },
        });
        setIcon(button, "sparkles");
        button.addEventListener("mousedown", (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          void this.generateForActiveFile(kind, button);
        });
      });
    });
  }

  fieldKeyForKind(kind) {
    const map = {
      summary_short: "AI_summary_short",
      summary_long: "AI_summary_long",
      tags: "AI_tags",
      technical_depth: "AI_technical_depth",
      qa: "AI_qa",
      ai_title: "AI_title",
    };
    return map[kind] || kind;
  }

  findPropertyRows(kind, scope = document) {
    const field = this.fieldKeyForKind(kind);
    const direct = Array.from(scope.querySelectorAll(`.metadata-property[data-property-key="${field}"]`));
    if (direct.length > 0) return direct;
    const rows = Array.from(scope.querySelectorAll(".metadata-property"));
    return rows.filter((row) => {
      const keyInput = row.querySelector(".metadata-property-key-input");
      const keyEl = row.querySelector(".metadata-property-key");
      const keyText = (keyInput && keyInput.value) || (keyEl && keyEl.innerText) || "";
      return keyText.trim() === field;
    });
  }

  async generateForActiveFile(kind, button) {
    const file = this.app.workspace.getActiveFile();
    if (!(file instanceof TFile) || file.extension !== "md") {
      new Notice("xyblue135 私人·AI 元数据：请先打开一个 Markdown 笔记");
      return;
    }
    if (!this.isWhitelisted(file)) {
      new Notice(`xyblue135 私人·AI 元数据：仅允许处理 /${this.normalizeWhitelistFolder()} 目录中的 Markdown`);
      return;
    }
    if (!String(this.settings.apiKey || "").trim()) {
      new Notice("xyblue135 私人·AI 元数据：请先在插件设置里填写 API Key");
      return;
    }
    if (this.fileBusy.has(file.path)) return;

    // v0.4.6：Properties 侧按钮始终保持单字段语义；`kind === "all"` 仍供命令、批量和自动流程使用。
    const effectiveKind = kind;
    const stateButtons = [button];
    const setStateForButtons = (state) => stateButtons.forEach((item) => this.setButtonState(item, state));

    this.fileBusy.add(file.path);
    setStateForButtons("loading");
    try {
      if (effectiveKind === "all") {
        const result = await this.generateAllForFile(file, "manual");
        new Notice("xyblue135 私人·AI 元数据：6 项 AI 元数据已更新");
      } else if (effectiveKind === "summaries") {
        await this.generateSelectedForFile(file, ["summary_short", "summary_long"], "manual");
        new Notice("xyblue135 私人·AI 元数据：AI_summary_short + AI_summary_long 已更新");
      } else {
        const result = await this.generateSingleForFile(file, effectiveKind, "manual");
        if (effectiveKind === "summary_short") new Notice("xyblue135 私人·AI 元数据：AI_summary_short 已更新");
        else if (effectiveKind === "summary_long") new Notice("xyblue135 私人·AI 元数据：AI_summary_long 已更新");
        else if (effectiveKind === "technical_depth") new Notice(`xyblue135 私人·AI 元数据：AI_technical_depth 已更新为 ${result.technicalDepth}`);
        else if (effectiveKind === "qa") new Notice("xyblue135 私人·AI 元数据：AI_qa 面试问答已更新");
        else if (effectiveKind === "ai_title") new Notice("xyblue135 私人·AI 元数据：AI_title 已生成参考标题");
        else new Notice(`xyblue135 私人·AI 元数据：已写入 ${result.tags.length} 个 AI_tags`);
      }
      setStateForButtons("success");
      window.setTimeout(() => setStateForButtons("idle"), 1200);
      this.scheduleInjection();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const record = this.state.files[file.path] || {};
      if (error && error.code === "EMPTY_BODY") {
        record.lastError = "";
        record.lastErrorType = "";
        record.lastRawModelOutput = "";
        this.state.files[file.path] = record;
        this.scheduleStateSave();
        setStateForButtons("idle");
        new Notice("xyblue135 私人·AI 元数据：跳过，无可分析正文");
      } else {
        record.lastError = message.slice(0, 1000);
        record.lastErrorType = error && error.code ? String(error.code) : "ERROR";
        record.lastRawModelOutput = error && error.rawOutput ? String(error.rawOutput).slice(0, 16000) : "";
        this.state.files[file.path] = record;
        this.scheduleStateSave();
        setStateForButtons("error");
        this.setRuntimeStatus("error", { filePath: file.path, phase: effectiveKind, message });
        new Notice(`xyblue135 私人·AI 元数据 失败：${message}`, 7000);
        window.setTimeout(() => setStateForButtons("idle"), 1800);
      }
    } finally {
      this.fileBusy.delete(file.path);
      if (!this.autoRunning && !this.unloading) {
        window.setTimeout(() => {
          if (!this.autoRunning && !this.unloading) this.setRuntimeStatus("idle");
        }, 1200);
      }
    }
  }

  async prepareFile(file) {
    const raw = await this.app.vault.cachedRead(file);
    const fingerprint = this.computeSourceFingerprint(raw, file);
    const body = this.stripFrontmatter(raw).trim();
    if (!body) throw new EmptyNoteBodyError("笔记正文为空", fingerprint);
    return { raw, body, fingerprint };
  }

  async generateSingleForFile(file, kind, reason, progress = null, taskContext = {}) {
    return this.generateSelectedForFile(file, [kind], reason, progress, taskContext);
  }

  async generateAllForFile(file, reason, progress = null, taskContext = {}) {
    return this.generateSelectedForFile(file, ["summary_short", "summary_long", "tags", "technical_depth", "qa", "ai_title"], reason, progress, taskContext);
  }

  async generateSelectedForFile(file, kinds, reason, progress = null, taskContext = {}) {
    const requested = Array.from(new Set((Array.isArray(kinds) ? kinds : [kinds]).filter((kind) =>
      ["summary_short", "summary_long", "tags", "technical_depth", "qa", "ai_title"].includes(kind))));
    if (!requested.length) throw new Error("没有可生成的元数据字段");

    const abortSignal = taskContext.abortSignal || null;
    const scopeFolder = taskContext.scopeFolder || "";
    const respectStatusFilter = taskContext.respectStatusFilter === true;
    this.ensureTaskActive(abortSignal);
    if (scopeFolder) this.assertFileStillInFolder(file, scopeFolder);
    if (respectStatusFilter) this.assertRecognitionEligible(file);

    const prepared = await this.prepareFile(file);
    const currentTags = this.readCurrentTags(file);
    const context = { filePath: file.path, reason, progress, abortSignal };
    let result = {};

    const bundleKinds = requested.filter((kind) => kind !== "qa" && kind !== "ai_title");
    if (bundleKinds.length >= 2 && this.settings.experimentalCombinedRequestEnabled === true) {
      result = await this.generateMetadataBundle(prepared.body, file.basename, currentTags, bundleKinds, context);
    } else {
      // 关闭合并请求时严格串行；只有全部逻辑结果生成成功后才统一写入，避免半更新。
      if (requested.includes("summary_short")) {
        result.summaryShort = await this.generateSummaryShort(prepared.body, file.basename, context);
        this.ensureTaskActive(abortSignal);
      }
      if (requested.includes("summary_long")) {
        result.summaryLong = await this.generateSummaryLong(prepared.body, file.basename, context);
        this.ensureTaskActive(abortSignal);
      }
      if (requested.includes("tags")) {
        result.weightedTags = await this.generateTags(prepared.body, file.basename, currentTags, context);
        result.tags = result.weightedTags.map((item) => item.value);
      }
      if (requested.includes("technical_depth")) {
        result.technicalDepthResult = await this.generateTechnicalDepth(prepared.body, file.basename, context);
        result.technicalDepth = result.technicalDepthResult.technical_depth;
      }
    }

    if (requested.includes("qa")) {
      result.qa = await this.generateQa(prepared.body, file.basename, context);
      this.ensureTaskActive(abortSignal);
    }

    if (requested.includes("ai_title")) {
      result.title = await this.generateTitle(prepared.body, file.basename, context);
      this.ensureTaskActive(abortSignal);
    }

    if (requested.includes("tags") && !result.tags) {
      result.weightedTags = Array.isArray(result.weightedTags) ? result.weightedTags : [];
      result.tags = result.weightedTags.map((item) => item.value);
    }

    this.ensureLifecycleActive();
    this.ensureTaskActive(abortSignal);
    if (scopeFolder) this.assertFileStillInFolder(file, scopeFolder);
    if (respectStatusFilter) this.assertRecognitionEligible(file);
    await this.assertSourceUnchanged(file, prepared.fingerprint);

    const phase = requested.join(" + ");
    this.setRuntimeStatus("writing", { ...context, phase });
    await this.withAiWrite(file, async () => {
      this.ensureLifecycleActive();
      this.ensureTaskActive(abortSignal);
      if (scopeFolder) this.assertFileStillInFolder(file, scopeFolder);
      if (respectStatusFilter) this.assertRecognitionEligible(file);
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        if (requested.includes("summary_short")) frontmatter.AI_summary_short = result.summaryShort;
        if (requested.includes("summary_long")) frontmatter.AI_summary_long = result.summaryLong;
        if (requested.includes("tags")) frontmatter.AI_tags = result.tags;
        if (requested.includes("technical_depth")) frontmatter.AI_technical_depth = result.technicalDepth;
        if (requested.includes("qa")) frontmatter.AI_qa = result.qa;
        if (requested.includes("ai_title")) frontmatter.AI_title = result.title;
      });
    });

    this.markProcessed(file, prepared.fingerprint, requested);
    if (requested.includes("tags")) this.scheduleTagCatalogRebuild(700);
    return result;
  }

  async assertSourceUnchanged(file, expectedFingerprint) {
    const currentRaw = await this.app.vault.cachedRead(file);
    const currentFingerprint = this.computeSourceFingerprint(currentRaw, file);
    if (currentFingerprint !== expectedFingerprint) {
      throw new Error("AI 生成期间笔记正文发生变化，本次结果未写入；下次会重新生成");
    }
  }

  async withAiWrite(file, fn) {
    await fn();
  }

  stripFrontmatter(content) {
    if (!content.startsWith("---")) return content;
    const match = content.match(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/);
    return match ? content.slice(match[0].length) : content;
  }

  extractFrontmatterBlock(content) {
    if (!content.startsWith("---")) return "";
    const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n|$)/);
    return match ? match[1] : "";
  }

  // 内容指纹会忽略由 AI 管理的 legacy summary、summary_short、summary_long、tags、technical_depth 行，因此插件自身写入不会造成循环更新。
  computeSourceFingerprint(raw, file) {
    const body = this.stripFrontmatter(raw).replace(/\r\n/g, "\n").trim();
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
    const sanitized = {};
    Object.keys(fm)
      .filter((key) => !["summary", "summary_short", "summary_long", "tags", "technical_depth", "qa", "AI_summary_short", "AI_summary_long", "AI_tags", "AI_technical_depth", "AI_qa", "AI_title", "position"].includes(key))
      .sort()
      .forEach((key) => {
        sanitized[key] = this.stableClone(fm[key]);
      });
    const source = `${JSON.stringify(sanitized)}\n${body}`;
    return this.hashString(source);
  }

  stableClone(value) {
    if (Array.isArray(value)) return value.map((item) => this.stableClone(item));
    if (value && typeof value === "object") {
      const out = {};
      Object.keys(value).sort().forEach((key) => {
        out[key] = this.stableClone(value[key]);
      });
      return out;
    }
    return value;
  }

  hashString(text) {
    // 使用 FNV-1a 风格的 32 位 hash：只用于变化检测，不用于密码学安全。
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  readCurrentTags(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache && cache.frontmatter;
    const value = frontmatter && frontmatter.AI_tags;
    return this.normalizeTagList(value).filter((tag) => this.isValidTagValue(tag));
  }

  normalizeTagList(value) {
    let items = [];
    if (Array.isArray(value)) items = value;
    else if (typeof value === "string") items = value.split(/[\s,]+/);
    return Array.from(new Set(items.map((item) => this.normalizeTagValue(item)).filter(Boolean)));
  }

  getFrontmatterTagItems(value) {
    if (Array.isArray(value)) return value.slice();
    if (typeof value === "string") return value.split(/[\s,]+/).filter((item) => item !== "");
    return [];
  }

  getFlatComparableTagValue(value) {
    const cleaned = String(value ?? "").trim().replace(/^#/, "");
    return this.isValidTagValue(cleaned) ? cleaned : "";
  }

  normalizeTagValue(tag) {
    const cleaned = String(tag || "").trim().replace(/^#/, "").replace(/^\/+|\/+$/g, "");
    if (!cleaned) return "";
    const parts = cleaned.split("/").map((part) => part.trim()).filter(Boolean);
    return (parts.length ? parts[parts.length - 1] : cleaned).trim();
  }

  isValidTagValue(tag) {
    const value = String(tag || "").trim();
    if (!value) return false;
    // 本地硬过滤：仅允许汉字、ASCII 字母/数字、下划线和连字符。
    // This deliberately rejects punctuation-heavy technical names such as B+树/C++/.NET;
    // the model must return semantic aliases such as BPlus树/CPlusPlus/DotNet instead.
    return /^(?=.*[\p{Script=Han}A-Za-z_-])[\p{Script=Han}A-Za-z0-9_-]+$/u.test(value);
  }

  scheduleTagCatalogRebuild(delay = 800) {
    if (this.catalogTimer !== null) window.clearTimeout(this.catalogTimer);
    this.catalogTimer = window.setTimeout(() => {
      this.catalogTimer = null;
      void this.rebuildTagCatalog();
    }, delay);
  }

  async rebuildTagCatalog() {
    const catalog = {};
    const files = this.getNotesFiles();
    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      const fmTags = this.normalizeTagList(cache?.frontmatter?.AI_tags).filter((tag) => this.isValidTagValue(tag));
      const inlineTags = Array.isArray(cache?.tags)
        ? cache.tags
            .map((item) => this.normalizeTagValue(item.tag))
            .filter((tag) => tag && this.isValidTagValue(tag))
        : [];
      const fileTags = Array.from(new Set([...fmTags, ...inlineTags]));
      for (const tag of fileTags) {
        if (!catalog[tag]) catalog[tag] = { count: 0, files: 0 };
        catalog[tag].count += 1;
        catalog[tag].files += 1;
      }
    }
    // 仅更新内存索引。Tag Catalog 可由 Vault 随时重建，不写入 data.json。
    this.state.tagCatalog = catalog;
    return catalog;
  }

  getTagCatalogEntries(limit = 300) {
    return Object.entries(this.state.tagCatalog || {})
      .filter(([value]) => this.isValidTagValue(value))
      .map(([value, meta]) => ({ value, count: Number(meta?.count || 0) }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "zh-CN"))
      .slice(0, limit);
  }

  getTechnicalTagCanonicalMap() {
    const map = new Map();
    const lines = String(this.settings.technicalTagCanonicalList || "").split(/\r?\n/);
    for (const line of lines) {
      const value = this.normalizeTagValue(line);
      if (!value || !this.isValidTagValue(value)) continue;
      const key = value.toLocaleLowerCase("en-US");
      if (!map.has(key)) map.set(key, value);
    }
    return map;
  }

  getExistingTagCase(value) {
    const normalized = this.normalizeTagValue(value);
    if (!normalized) return "";
    const key = normalized.toLocaleLowerCase("en-US");
    const technical = this.getTechnicalTagCanonicalMap().get(key) || "";
    const matches = Object.entries(this.state.tagCatalog || {})
      .filter(([tag]) => this.isValidTagValue(tag) && tag.toLocaleLowerCase("en-US") === key)
      .map(([tag, meta]) => ({ value: tag, count: Number(meta?.count || 0) }));
    if (!matches.length) return "";
    matches.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      const aTechnical = technical && a.value === technical ? 1 : 0;
      const bTechnical = technical && b.value === technical ? 1 : 0;
      if (aTechnical !== bTechnical) return bTechnical - aTechnical;
      return a.value.localeCompare(b.value, "zh-CN");
    });
    return matches[0].value;
  }

  canonicalizeTagCase(value) {
    const normalized = this.normalizeTagValue(value);
    if (!normalized || this.settings.tagCaseNormalizationEnabled === false) return normalized;

    // 优先级 1：优先沿用当前 Vault 已经形成的 Tag 写法。若存在历史大小写变体，
    // 使用次数最多者优先；次数并列时，如果技术词标准写法已存在于候选中，则优先标准写法。
    const existing = this.getExistingTagCase(normalized);
    if (existing) return existing;

    // 优先级 2：如果 Vault 从未使用过该 Tag，则回退到内置/可编辑的技术词规范表。
    // 本地 Tag 索引数据不会发送给 AI。
    const technical = this.getTechnicalTagCanonicalMap().get(normalized.toLocaleLowerCase("en-US"));
    return technical || normalized;
  }

  async getFrontmatterTagCaseConflicts() {
    const grouped = new Map();
    for (const file of this.getNotesFiles()) {
      const cache = this.app.metadataCache.getFileCache(file);
      const tags = this.getFrontmatterTagItems(cache?.frontmatter?.AI_tags)
        .map((tag) => this.getFlatComparableTagValue(tag))
        .filter(Boolean);
      for (const tag of new Set(tags)) {
        const key = tag.toLocaleLowerCase("en-US");
        if (!grouped.has(key)) grouped.set(key, new Map());
        const variants = grouped.get(key);
        variants.set(tag, (variants.get(tag) || 0) + 1);
      }
    }

    const technicalMap = this.getTechnicalTagCanonicalMap();
    const conflicts = [];
    for (const [key, variantsMap] of grouped.entries()) {
      if (variantsMap.size < 2) continue;
      const technical = technicalMap.get(key) || "";
      const variants = Array.from(variantsMap.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          const aTechnical = technical && a.value === technical ? 1 : 0;
          const bTechnical = technical && b.value === technical ? 1 : 0;
          if (aTechnical !== bTechnical) return bTechnical - aTechnical;
          return a.value.localeCompare(b.value, "zh-CN");
        });
      conflicts.push({
        key,
        target: variants[0].value,
        variants,
        total: variants.reduce((sum, item) => sum + item.count, 0),
      });
    }
    return conflicts.sort((a, b) => b.total - a.total || a.target.localeCompare(b.target, "zh-CN"));
  }

  async applyFrontmatterTagCaseConflicts(conflicts, onProgress = null) {
    const targetByKey = new Map((Array.isArray(conflicts) ? conflicts : []).map((group) => [group.key, group.target]));
    if (!targetByKey.size) return { changedFiles: 0, changedTags: 0 };

    let changedFiles = 0;
    let changedTags = 0;
    const files = this.getNotesFiles();
    let index = 0;
    for (const file of files) {
      index += 1;
      const cache = this.app.metadataCache.getFileCache(file);
      const tags = this.getFrontmatterTagItems(cache?.frontmatter?.AI_tags);
      if (!tags.length) {
        if (onProgress) onProgress({ index, total: files.length, filePath: file.path, changed: false });
        continue;
      }
      let fileChangedTags = 0;
      const nextTags = [];
      const seenComparable = new Set();
      for (const rawTag of tags) {
        const comparable = this.getFlatComparableTagValue(rawTag);
        if (!comparable) {
          // 与本次整理无关的旧值（例如层级 Tag 或含较多标点的 Tag）保持原样；这里只处理内容相同、仅字母大小写不同的扁平 Tag。
          nextTags.push(rawTag);
          continue;
        }
        const key = comparable.toLocaleLowerCase("en-US");
        const target = targetByKey.get(key);
        const next = target || comparable;
        if (target && next !== comparable) fileChangedTags += 1;
        if (target) {
          if (seenComparable.has(key)) {
            fileChangedTags += 1;
            continue;
          }
          seenComparable.add(key);
        }
        nextTags.push(target ? next : rawTag);
      }
      if (!fileChangedTags) {
        if (onProgress) onProgress({ index, total: files.length, filePath: file.path, changed: false });
        continue;
      }

      await this.withAiWrite(file, async () => {
        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
          frontmatter.AI_tags = nextTags;
        });
      });
      changedFiles += 1;
      changedTags += fileChangedTags;
      if (onProgress) onProgress({ index, total: files.length, filePath: file.path, changed: true });
    }
    await this.rebuildTagCatalog();
    return { changedFiles, changedTags };
  }

  renderHarness(template) {
    return String(template || "")
      .replaceAll("{{summaryShortMaxChars}}", String(this.settings.summaryShortMaxChars))
      .replaceAll("{{summaryLongMaxChars}}", String(this.settings.summaryLongMaxChars))
      // 兼容用户旧 Harness 中尚未改掉的占位符：默认映射到长摘要长度。
      .replaceAll("{{summaryMaxChars}}", String(this.settings.summaryLongMaxChars))
      .replaceAll("{{maxTags}}", String(this.settings.maxTags))
      .replaceAll("{{maxQuestions}}", String(this.settings.qaMaxQuestions))
      .replaceAll("{{maxItems}}", String(this.settings.aiTitleMaxItems))
      .replaceAll("{{whitelistFolder}}", this.normalizeWhitelistFolder());
  }

  renderTechnicalDepthPrompt(body) {
    return this.renderHarness(this.settings.technicalDepthHarness || DEFAULT_TECHNICAL_DEPTH_HARNESS)
      .replaceAll("{{ARTICLE}}", String(body || ""));
  }

  renderTechnicalDepthRubric() {
    let rubric = this.renderHarness(this.settings.technicalDepthHarness || DEFAULT_TECHNICAL_DEPTH_HARNESS);
    const outputIndex = rubric.indexOf("## 输出格式");
    if (outputIndex >= 0) rubric = rubric.slice(0, outputIndex);
    return rubric.replaceAll("{{ARTICLE}}", "").trim();
  }

  cleanMarkdownForSummary(body) {
    if (this.settings.summaryMarkdownCleanupEnabled !== true) return String(body || "");

    let text = String(body || "").replace(/\r\n/g, "\n");

    // 纯文本摘要请求无法利用图片视觉内容，因此图片本身不作为有效输入。
    text = text
      .replace(/!\[\[[^\]]+\]\]/g, "")
      .replace(/!\[[^\]]*\]\([^\n)]*\)/g, "");

    // 围栏代码块：短代码保留；大代码块折叠为提示，以减少 Token 和噪声。
    text = text.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (_match, language, code) => {
      const lang = String(language || "").trim();
      const content = String(code || "").trim();
      if (content.length > 500) {
        return `\n[代码块${lang ? `：${lang}` : ""}，已省略，原长度 ${content.length} 字符]\n`;
      }
      return content ? `\n${content}\n` : "\n";
    });

    // 去除仅用于展示的 Markdown 语法，同时保留有意义的文本内容。
    text = text
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/`([^`\n]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^\n)]*\)/g, "$1")
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      .replace(/^\s{0,3}>\s?/gm, "")
      .replace(/^\s{0,3}[-*_]{3,}\s*$/gm, "")
      .replace(/(\*\*|__|~~)(.*?)\1/g, "$2")
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return text;
  }

  normalizeSummaryText(text, maxChars, fallbackMax = 100) {
    const limit = Math.max(20, Number(maxChars) || fallbackMax);
    let summary = String(text ?? "")
      .replace(/^[\"'“”]+|[\"'“”]+$/g, "")
      .replace(/\s*\n+\s*/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!summary) return "";
    if (summary.length <= limit) return summary;

    const clipped = summary.slice(0, limit).trimEnd();
    const sentenceFloor = Math.floor(limit * 0.42);
    const clauseFloor = Math.floor(limit * 0.68);
    let sentenceCut = -1;
    for (const mark of ["。", "！", "？", "；"]) {
      sentenceCut = Math.max(sentenceCut, clipped.lastIndexOf(mark));
    }
    if (sentenceCut >= sentenceFloor) return clipped.slice(0, sentenceCut + 1).trim();

    let clauseCut = -1;
    for (const mark of ["，", ",", ";", "、"]) {
      clauseCut = Math.max(clauseCut, clipped.lastIndexOf(mark));
    }
    if (clauseCut >= clauseFloor) return clipped.slice(0, clauseCut + 1).trim();
    return clipped;
  }

  async generateSummaryShort(body, title, context = {}) {
    const summaryBody = this.cleanMarkdownForSummary(body);
    const harness = this.settings.summaryShortHarnessEnabled !== false
      ? `\n\n[Summary Short Harness]\n${this.renderHarness(this.settings.summaryShortHarness)}`
      : "";
    const system = `你是 Obsidian 知识库的元数据整理助手。${harness}`;
    const prompt = [
      `笔记标题：${title}`,
      `summary_short 最大字符数：${this.settings.summaryShortMaxChars}`,
      "请根据以下正文生成 summary_short。只输出摘要正文，不要输出字段名。",
      "",
      summaryBody,
    ].join("\n");

    const raw = await this.chat(system, prompt, { ...context, phase: "Summary Short" });
    const summary = this.normalizeSummaryText(raw, this.settings.summaryShortMaxChars, 100);
    if (!summary) throw new Error("AI 返回了空 summary_short");
    return summary;
  }

  async generateSummaryLong(body, title, context = {}) {
    const summaryBody = this.cleanMarkdownForSummary(body);
    const harness = this.settings.summaryLongHarnessEnabled !== false
      ? `\n\n[Summary Long Harness]\n${this.renderHarness(this.settings.summaryLongHarness)}`
      : "";
    const system = `你是 Obsidian 知识库的元数据整理助手。${harness}`;
    const prompt = [
      `笔记标题：${title}`,
      `summary_long 最大字符数：${this.settings.summaryLongMaxChars}`,
      "请根据以下正文生成 summary_long。只输出摘要正文，不要输出字段名。",
      "",
      summaryBody,
    ].join("\n");

    const raw = await this.chat(system, prompt, { ...context, phase: "Summary Long" });
    const summary = this.normalizeSummaryText(raw, this.settings.summaryLongMaxChars, 300);
    if (!summary) throw new Error("AI 返回了空 summary_long");
    return summary;
  }

  async generateTags(body, title, currentTags, context = {}) {
    const maxTags = Math.max(1, Number(this.settings.maxTags) || 7);
    const harness = this.settings.tagsHarnessEnabled
      ? `\n\n可编辑 Tags Harness：\n${this.renderHarness(this.settings.tagsHarness)}`
      : "";
    const system = [
      "你是 Obsidian 知识库标签整理助手。",
      "[标签合法性协议｜始终生效]",
      TAG_VALUE_SAFETY_PROTOCOL,
      harness,
    ].filter(Boolean).join("\n");
    const basePrompt = [
      `笔记标题：${title}`,
      `当前 tags（已转为 value）：${currentTags.length ? currentTags.join("、") : "无"}`,
      `请生成最多 ${maxTags} 个互不重复、合法的标签，并按 Harness 的技术优先规则给 weight；优先质量，不要为了凑满数量输出泛化或低质量标签。`,
      "首选返回 JSON 对象 {\"tags\":[...]}；tags 每项必须是 {\"value\":\"标签\",\"weight\":0.0}，weight 使用 0~1。插件也兼容直接返回顶层 tags 数组。不要返回解释、Markdown 或代码块。",
      `插件会在本地过滤非法 value、去重并按 weight 排序，最终最多保留 ${maxTags} 个；少于 ${maxTags} 个也属于有效结果。`,
      "",
      "笔记正文：",
      body,
    ].join("\n");

    const rawAttempts = [];
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const retryHint = attempt === 1 ? "" : "\n\n上一次结构化输出未通过解析或校验。这是自动重试，只返回完全合法的 JSON 对象，不要添加任何其他文字。";
      const text = await this.chat(
        system,
        `${basePrompt}${retryHint}`,
        { ...context, phase: attempt === 1 ? "Tags" : "Tags（结构重试 1/1）" },
        { jsonMode: true },
      );
      rawAttempts.push(text);
      try {
        const parsed = this.parseTagsEnvelope(text);
        return this.rankWeightedTags(parsed.tags);
      } catch (error) {
        const structured = this.asStructuredOutputError(error, text, rawAttempts);
        if (attempt >= 2) throw structured;
        console.warn(`[xyblue135 私人·AI 元数据] Tags 结构化输出失败，自动重试 1 次：${context.filePath || title}`, structured);
      }
    }
    throw new StructuredOutputError("Tags 结构化输出失败", rawAttempts.join("\n\n"));
  }

  async generateTechnicalDepth(body, title, context = {}) {
    const system = this.settings.technicalDepthHarnessEnabled !== false
      ? "请严格执行用户提供的 technical_depth 评分标准，并只返回评分 JSON。"
      : "你是技术内容评审员。请对文章技术深度进行 0～100 整数评分，并返回包含 technical_depth、五个分项和 reason 的 JSON；五个分项之和必须等于总分。";
    const basePrompt = this.settings.technicalDepthHarnessEnabled !== false
      ? this.renderTechnicalDepthPrompt(body)
      : [
        `文章标题：${title}`,
        "只返回 JSON：{\"technical_depth\":68,\"mechanism_depth\":20,\"engineering_depth\":17,\"analysis_validation\":13,\"system_complexity\":10,\"prerequisite_density\":8,\"reason\":\"一句话原因\"}",
        "文章全文：",
        body,
      ].join("\n");

    const rawAttempts = [];
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const retryHint = attempt === 1 ? "" : "\n\n上一次输出未通过 technical_depth 数值、分项范围或分项求和校验。这是自动重试，只返回完全合法的 JSON 对象。";
      const raw = await this.chat(
        system,
        `${basePrompt}${retryHint}`,
        { ...context, phase: attempt === 1 ? "Technical Depth" : "Technical Depth（结构重试 1/1）" },
        { jsonMode: true },
      );
      rawAttempts.push(raw);
      try {
        return this.parseTechnicalDepthEnvelope(raw, "Technical Depth");
      } catch (error) {
        const structured = this.asStructuredOutputError(error, raw, rawAttempts);
        if (attempt >= 2) throw structured;
        console.warn(`[xyblue135 私人·AI 元数据] Technical Depth 结构化输出失败，自动重试 1 次：${context.filePath || title}`, structured);
      }
    }
    throw new StructuredOutputError("Technical Depth 结构化输出失败", rawAttempts.join("\n\n"));
  }

  async generateQa(body, title, context = {}) {
    const qaBody = this.cleanMarkdownForSummary(body);
    const harness = this.settings.qaHarnessEnabled !== false
      ? `\n\n[QA Harness]\n${this.renderHarness(this.settings.qaHarness)}`
      : "";
    const system = `你是 Obsidian 知识库的面试出题助手。${harness}`;
    const prompt = [
      `笔记标题：${title}`,
      `请根据以下正文生成 ${this.settings.qaMaxQuestions} 道面试题。`,
      "只输出 Q/A 交替的纯文本，格式：Q: 题目 / A: 答案，每道题之间空一行；不要 Markdown、代码块或额外解释。",
      "",
      qaBody,
    ].join("\n");

    const raw = await this.chat(system, prompt, { ...context, phase: "QA" });
    const qa = this.normalizeQaText(raw);
    if (!qa) throw new Error("AI 返回了空 qa");
    return qa;
  }

  normalizeQaText(text) {
    return String(text ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/^```[\s\S]*?\n?|```$/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  async generateTitle(body, title, context = {}) {
    const titleBody = this.cleanMarkdownForSummary(body);
    const harness = this.settings.aiTitleHarnessEnabled !== false
      ? `\n\n[AI Title Harness]\n${this.renderHarness(this.settings.aiTitleHarness)}`
      : "";
    const system = `你是 Obsidian 知识库的标题生成助手。${harness}`;
    const prompt = [
      `笔记标题：${title}`,
      `请根据以下正文生成 ${this.settings.aiTitleMaxItems} 个参考性文章标题。`,
      "只输出纯文本标题列表，每行一个标题，不要序号、Markdown 列表符号、代码块或额外解释。",
      "",
      titleBody,
    ].join("\n");

    const raw = await this.chat(system, prompt, { ...context, phase: "TITLE" });
    const titles = this.normalizeTitle(raw);
    if (!titles.length) throw new Error("AI 返回了空 AI_title");
    return titles;
  }

  normalizeTitle(text) {
    return String(text ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/^```[\s\S]*?\n?|```$/g, "")
      .split("\n")
      .map((line) => line.replace(/^[\s]*[-*•\d.、)）]+[\s]*/, "").trim())
      .filter((line) => line.length > 0)
      .slice(0, Math.max(1, Number(this.settings.aiTitleMaxItems) || 5));
  }

  parseTechnicalDepthEnvelope(text, label = "Technical Depth") {
    const value = this.parseJsonObjectWithRepair(text, label);
    return this.validateTechnicalDepthResult(value, text, label);
  }

  validateTechnicalDepthResult(value, rawText = "", label = "Technical Depth") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new StructuredOutputError(`${label} 必须返回 JSON 对象`, rawText);
    }
    const ranges = {
      technical_depth: [0, 100],
      mechanism_depth: [0, 28],
      engineering_depth: [0, 24],
      analysis_validation: [0, 19],
      system_complexity: [0, 17],
      prerequisite_density: [0, 12],
    };
    const out = {};
    for (const [key, [min, max]] of Object.entries(ranges)) {
      const numeric = Number(value[key]);
      if (!Number.isInteger(numeric) || numeric < min || numeric > max) {
        throw new StructuredOutputError(`${label} 的 ${key} 必须是 ${min}～${max} 的整数`, rawText);
      }
      out[key] = numeric;
    }
    const sum = out.mechanism_depth + out.engineering_depth + out.analysis_validation + out.system_complexity + out.prerequisite_density;
    if (sum !== out.technical_depth) {
      throw new StructuredOutputError(`${label} 五个维度之和 ${sum} 不等于 technical_depth ${out.technical_depth}`, rawText);
    }
    out.reason = String(value.reason || "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!out.reason) throw new StructuredOutputError(`${label} 缺少 reason`, rawText);
    return out;
  }

  async generateMetadataBundle(body, title, currentTags, requestedKinds, context = {}) {
    const requested = Array.from(new Set(requestedKinds || []));
    const wantShort = requested.includes("summary_short");
    const wantLong = requested.includes("summary_long");
    const wantTags = requested.includes("tags");
    const wantDepth = requested.includes("technical_depth");
    const combinedBody = this.cleanMarkdownForSummary(body);
    const fullBody = String(body || "");
    const sharedCombinedBody = combinedBody === fullBody;
    const maxTags = Math.max(1, Number(this.settings.maxTags) || 7);

    const shortHarness = wantShort && this.settings.summaryShortHarnessEnabled !== false
      ? `\n[Summary Short Harness]\n${this.renderHarness(this.settings.summaryShortHarness)}`
      : "";
    const longHarness = wantLong && this.settings.summaryLongHarnessEnabled !== false
      ? `\n[Summary Long Harness]\n${this.renderHarness(this.settings.summaryLongHarness)}`
      : "";
    const tagsHarness = wantTags && this.settings.tagsHarnessEnabled
      ? `\n[Tags Harness]\n${this.renderHarness(this.settings.tagsHarness)}`
      : "";
    const depthHarness = wantDepth && this.settings.technicalDepthHarnessEnabled !== false
      ? `\n[Technical Depth 评分标准]\n${this.renderTechnicalDepthRubric()}`
      : "";

    const system = [
      "你是 Obsidian 知识库的元数据整理助手。一次请求需要完成指定的多个元数据任务；各字段用途不同，不能互相复制或混淆。",
      "必须严格遵守输出 JSON 协议；不要输出 Markdown 代码块、解释、前言或后记。",
      wantTags ? "[标签合法性协议｜始终生效]" : "",
      wantTags ? TAG_VALUE_SAFETY_PROTOCOL : "",
      shortHarness,
      longHarness,
      tagsHarness,
      depthHarness,
    ].filter(Boolean).join("\n");

    const taskLines = [];
    const schema = {};
    if (wantShort) {
      taskLines.push(`- summary_short：生成用于快速识别主题的短摘要，最大 ${this.settings.summaryShortMaxChars} 字符。`);
      schema.summary_short = "短摘要文本";
    }
    if (wantLong) {
      taskLines.push(`- summary_long：生成用于理解文章结构的长摘要，最大 ${this.settings.summaryLongMaxChars} 字符。`);
      schema.summary_long = "长摘要文本";
    }
    if (wantTags) {
      taskLines.push(`- tags：生成最多 ${maxTags} 个互不重复、合法的标签并给出 0~1 的 weight；优先质量，不要求凑满。`);
      schema.tags = [{ value: "标签", weight: 0.0 }];
    }
    if (wantDepth) {
      taskLines.push("- technical_depth：完整阅读文章后按五维评分标准打分；五个维度之和必须严格等于总分。最终 frontmatter 只保存总分。");
      schema.technical_depth = {
        technical_depth: 68,
        mechanism_depth: 20,
        engineering_depth: 17,
        analysis_validation: 13,
        system_complexity: 10,
        prerequisite_density: 8,
        reason: "一句话说明评分原因",
      };
    }

    const basePrompt = [
      `笔记标题：${title}`,
      wantShort ? `summary_short 最大字符数：${this.settings.summaryShortMaxChars}` : "",
      wantLong ? `summary_long 最大字符数：${this.settings.summaryLongMaxChars}` : "",
      wantTags ? `当前 tags（已转为 value）：${currentTags.length ? currentTags.join("、") : "无"}` : "",
      "请同时完成以下字段：",
      ...taskLines,
      "",
      "唯一允许的返回结构：",
      JSON.stringify(schema),
      "只返回上面要求的字段，不要增加解释字段。",
      wantShort && wantLong ? "summary_short 负责快速识别主题；summary_long 负责还原文章结构，两者必须明显区分信息密度，不能只是同一句话改写长度。" : "",
      wantTags ? `插件会在本地过滤非法 tags、去重并按 weight 排序，最终最多保留 ${maxTags} 个。` : "",
      wantDepth ? "technical_depth 必须使用完整正文评分，不得只根据标题、摘要、开头、长度、代码数量或术语数量判断。" : "",
      "",
      sharedCombinedBody && wantDepth ? "笔记完整正文（供本次所有任务使用）：" : "",
      sharedCombinedBody && wantDepth ? fullBody : "",
      !sharedCombinedBody && (wantShort || wantLong || wantTags) ? "用于摘要/标签任务的正文：" : "",
      !sharedCombinedBody && (wantShort || wantLong || wantTags) ? combinedBody : "",
      !sharedCombinedBody && wantDepth ? "用于 technical_depth 评分的完整文章全文：" : "",
      !sharedCombinedBody && wantDepth ? fullBody : "",
      !wantDepth && (wantShort || wantLong || wantTags) ? "笔记正文：" : "",
      !wantDepth && (wantShort || wantLong || wantTags) ? combinedBody : "",
    ].filter((line) => line !== "").join("\n");

    const rawAttempts = [];
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const retryHint = attempt === 1 ? "" : "\n\n上一次结构化输出未通过解析或校验。这是自动重试，只返回完全合法的 JSON 对象，不要添加任何其他文字。";
      const raw = await this.chat(
        system,
        `${basePrompt}${retryHint}`,
        { ...context, phase: attempt === 1 ? `合并：${requested.join(" + ")}` : `合并结构重试：${requested.join(" + ")}` },
        { jsonMode: true },
      );
      rawAttempts.push(raw);
      try {
        const parsed = this.parseMetadataBundle(raw, { wantShort, wantLong, wantTags, wantDepth });
        const result = {};
        if (wantShort) {
          result.summaryShort = this.normalizeSummaryText(parsed.summaryShort, this.settings.summaryShortMaxChars, 100);
          if (!result.summaryShort) throw new StructuredOutputError("合并请求没有返回可用 summary_short", raw);
        }
        if (wantLong) {
          result.summaryLong = this.normalizeSummaryText(parsed.summaryLong, this.settings.summaryLongMaxChars, 300);
          if (!result.summaryLong) throw new StructuredOutputError("合并请求没有返回可用 summary_long", raw);
        }
        if (wantTags) {
          result.weightedTags = this.rankWeightedTags(parsed.tags);
          result.tags = result.weightedTags.map((item) => item.value);
        }
        if (wantDepth) {
          result.technicalDepthResult = parsed.technicalDepthResult;
          result.technicalDepth = parsed.technicalDepthResult.technical_depth;
        }
        return result;
      } catch (error) {
        const structured = this.asStructuredOutputError(error, raw, rawAttempts);
        if (attempt >= 2) throw structured;
        console.warn(`[xyblue135 私人·AI 元数据] 合并结构化输出失败，自动重试 1 次：${context.filePath || title}`, structured);
      }
    }
    throw new StructuredOutputError("合并结构化输出失败", rawAttempts.join("\n\n"));
  }

  parseMetadataBundle(text, expected = {}) {
    const value = this.parseJsonObjectWithRepair(text, "合并请求");
    const out = {};

    if (expected.wantShort) {
      const field = this.firstStringField(value, ["summary_short", "summaryShort", "short_summary", "shortSummary"]);
      if (field.value === null) {
        throw new StructuredOutputError("合并请求缺少 summary_short 字符串", text);
      }
      out.summaryShort = field.value;
    }

    if (expected.wantLong) {
      const aliases = expected.wantShort
        ? ["summary_long", "summaryLong", "long_summary", "longSummary"]
        : ["summary_long", "summaryLong", "long_summary", "longSummary", "summary", "summary_text", "summaryText"];
      const field = this.firstStringField(value, aliases);
      if (field.value === null) {
        throw new StructuredOutputError("合并请求缺少 summary_long 字符串", text);
      }
      out.summaryLong = field.value;
    }

    if (expected.wantTags) {
      const field = this.firstArrayField(value, ["tags", "weighted_tags", "weightedTags", "tag_list", "tagList"]);
      if (field.value === null) {
        throw new StructuredOutputError("合并请求缺少 tags 数组", text);
      }
      out.tags = field.value;
    }

    if (expected.wantDepth) {
      const depthValue = value.technical_depth ?? value.technicalDepth ?? value.depth_score ?? value.depthScore;
      if (depthValue === undefined || depthValue === null) {
        throw new StructuredOutputError("合并请求缺少 technical_depth 评分对象", text);
      }
      if (depthValue && typeof depthValue === "object" && !Array.isArray(depthValue)) {
        out.technicalDepthResult = this.validateTechnicalDepthResult(depthValue, text, "合并请求 technical_depth");
      } else {
        throw new StructuredOutputError("合并请求的 technical_depth 必须包含总分、五个分项和 reason", text);
      }
    }

    return out;
  }

  rankWeightedTags(candidates) {
    const maxTags = Math.max(1, Number(this.settings.maxTags) || 7);
    const byValue = new Map();
    const rejected = [];
    (Array.isArray(candidates) ? candidates : []).forEach((item, index) => {
      const normalizedItem = typeof item === "string"
        ? { value: item, weight: Math.max(0, 1 - index * 0.01) }
        : (item || {});
      const rawValue = normalizedItem.value ?? normalizedItem.tag ?? normalizedItem.name ?? "";
      const rawNormalized = this.normalizeTagValue(rawValue);
      if (!rawNormalized) return;
      if (!this.isValidTagValue(rawNormalized)) {
        rejected.push(rawNormalized);
        return;
      }
      const value = this.canonicalizeTagCase(rawNormalized);
      const numericWeight = Number(normalizedItem.weight ?? normalizedItem.score ?? normalizedItem.relevance);
      const weight = Number.isFinite(numericWeight) ? numericWeight : Math.max(0, 1 - index * 0.01);
      const dedupKey = value.toLocaleLowerCase("en-US");
      const existing = byValue.get(dedupKey);
      if (!existing || weight > existing.weight) byValue.set(dedupKey, { value, weight });
    });

    if (rejected.length) {
      console.warn("[xyblue135 私人·AI 元数据] 已过滤非法 tag value：", Array.from(new Set(rejected)));
    }

    const ranked = Array.from(byValue.values())
      .sort((a, b) => b.weight - a.weight || a.value.localeCompare(b.value, "zh-CN"))
      .slice(0, maxTags);
    // maxTags 是上限，不是必须凑满的数量。本地过滤/去重后少于 maxTags 是允许的；
    // 只有“一个合法 Tag 都没有”才判失败，避免异常模型输出悄悄清空已有 tags。
    if (ranked.length === 0) {
      const suffix = rejected.length
        ? `；已过滤非法标签：${Array.from(new Set(rejected)).slice(0, 8).join("、")}`
        : "";
      throw new StructuredOutputError(`AI 没有返回任何可用 tag${suffix}`);
    }
    if (ranked.length < maxTags) {
      console.info(`[xyblue135 私人·AI 元数据] 合法唯一 tags 为 ${ranked.length}/${maxTags}，按实际数量写入。`);
    }
    return ranked;
  }

  stripJsonFences(text) {
    return String(text || "")
      .replace(/^\uFEFF/, "")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }

  extractJsonValueText(text) {
    const cleaned = this.stripJsonFences(text);
    if (!cleaned) throw new StructuredOutputError("返回内容为空", text);

    // 首先优先解析完整的清理后输出。对 Tags 很重要：
    // 合法的顶层 JSON 数组必须保留最外层的 [ ]。
    try {
      JSON.parse(cleaned);
      return cleaned;
    } catch (_) {
      // 某些 OpenAI 兼容后端即使要求结构化输出，仍会在 JSON 前后夹带说明文字；此时回退到提取第一个可信 JSON 根节点，并保留对象/数组类型。
    }

    const objectStart = cleaned.indexOf("{");
    const arrayStart = cleaned.indexOf("[");
    let start = -1;
    let open = "";
    let close = "";
    if (objectStart >= 0 && (arrayStart < 0 || objectStart < arrayStart)) {
      start = objectStart;
      open = "{";
      close = "}";
    } else if (arrayStart >= 0) {
      start = arrayStart;
      open = "[";
      close = "]";
    }
    if (start < 0) throw new StructuredOutputError("返回格式中没有 JSON 对象或数组", text);

    // 查找与起始符匹配的闭合符，同时正确处理字符串引号内部的括号。
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < cleaned.length; i += 1) {
      const ch = cleaned[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === open) depth += 1;
      else if (ch === close) {
        depth -= 1;
        if (depth === 0) return cleaned.slice(start, i + 1);
      }
    }

    // 如果模型只是漏掉最后一个闭合符，仍保留完整候选文本，
    // 让后续保守修复/错误报告能够准确处理。
    return cleaned.slice(start);
  }

  escapeControlCharsInsideJsonStrings(input) {
    let out = "";
    let inString = false;
    let escaped = false;
    for (let i = 0; i < input.length; i += 1) {
      const ch = input[i];
      if (inString) {
        if (escaped) {
          out += ch;
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          out += ch;
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inString = false;
          out += ch;
          continue;
        }
        if (ch === "\n") { out += "\\n"; continue; }
        if (ch === "\r") { out += "\\r"; continue; }
        if (ch === "\t") { out += "\\t"; continue; }
        const code = ch.charCodeAt(0);
        if (code >= 0 && code < 0x20) {
          out += `\\u${code.toString(16).padStart(4, "0")}`;
          continue;
        }
        out += ch;
        continue;
      }
      if (ch === '"') inString = true;
      out += ch;
    }
    return out;
  }

  transformJsonOutsideStrings(input, transform) {
    let out = "";
    let outside = "";
    let inString = false;
    let escaped = false;
    const flush = () => {
      if (!outside) return;
      out += transform(outside);
      outside = "";
    };
    for (let i = 0; i < input.length; i += 1) {
      const ch = input[i];
      if (inString) {
        out += ch;
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        flush();
        inString = true;
        out += ch;
      } else {
        outside += ch;
      }
    }
    flush();
    return out;
  }

  repairJsonText(input) {
    let text = String(input || "").trim();
    text = this.escapeControlCharsInsideJsonStrings(text);
    // 只修复字符串引号之外的 JSON 语法，避免改写笔记或 Tag 的真实语义。
    text = this.transformJsonOutsideStrings(text, (chunk) => chunk
      .replace(/}\s*(?={)/g, "},")
      .replace(/,\s*([}\]])/g, "$1"));
    return text;
  }

  parseJsonValueWithRepair(text, label = "结构化输出") {
    const candidate = this.extractJsonValueText(text);
    try {
      return JSON.parse(candidate);
    } catch (firstError) {
      if (this.settings.jsonRepairEnabled !== true) {
        throw new StructuredOutputError(
          `${label} JSON 解析失败：${firstError instanceof Error ? firstError.message : String(firstError)}`,
          text,
          { repairAttempted: false },
        );
      }
      const repaired = this.repairJsonText(candidate);
      try {
        const value = JSON.parse(repaired);
        console.info(`[xyblue135 私人·AI 元数据] ${label} 已通过本地 JSON 修复分支恢复。`);
        return value;
      } catch (secondError) {
        throw new StructuredOutputError(
          `${label} JSON 解析失败：${firstError instanceof Error ? firstError.message : String(firstError)}；本地修复后仍失败：${secondError instanceof Error ? secondError.message : String(secondError)}`,
          text,
          { repairAttempted: true, repairSucceeded: false, repairedText: repaired },
        );
      }
    }
  }

  parseJsonObjectWithRepair(text, label = "结构化输出") {
    const value = this.parseJsonValueWithRepair(text, label);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new StructuredOutputError(`${label} 返回格式不是 JSON 对象`, text);
    }
    return value;
  }

  firstStringField(value, keys) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { value: null, key: null };
    for (const key of keys) {
      if (typeof value[key] === "string") return { value: value[key], key };
    }
    return { value: null, key: null };
  }

  firstArrayField(value, keys) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { value: null, key: null };
    for (const key of keys) {
      if (Array.isArray(value[key])) return { value: value[key], key };
    }
    return { value: null, key: null };
  }

  parseTagsEnvelope(text) {
    const value = this.parseJsonValueWithRepair(text, "Tags 请求");

    // 兼容路径：部分 OpenAI 兼容后端会忽略 response_format=json_object，直接返回 Tag 数组。
    // 顶层数组仍属于合法结构化输出，因此直接接受，不浪费唯一一次自动重试。
    if (Array.isArray(value)) {
      console.info(`[xyblue135 私人·AI 元数据] Tags 请求返回顶层数组，已按 { tags: [...] } 兼容处理。`);
      return { tags: value };
    }

    if (!value || typeof value !== "object") {
      throw new StructuredOutputError("Tags 请求返回格式既不是 JSON 对象也不是数组", text);
    }

    const tagsField = this.firstArrayField(value, ["tags", "weighted_tags", "weightedTags", "tag_list", "tagList"]);
    if (tagsField.value === null) {
      throw new StructuredOutputError("Tags 请求缺少 tags 数组（兼容 tags / weighted_tags / weightedTags / tag_list / tagList）", text);
    }
    if (tagsField.key !== "tags") {
      console.info(`[xyblue135 私人·AI 元数据] Tags 请求字段别名已归一化：${tagsField.key} → tags。`);
    }
    return { tags: tagsField.value };
  }

  asStructuredOutputError(error, rawOutput, attempts = []) {
    if (error instanceof StructuredOutputError) {
      error.rawOutput = error.rawOutput || String(rawOutput || "");
      error.attempts = attempts.slice();
      if (attempts.length > 1) {
        error.rawOutput = attempts.map((item, index) => `【尝试 ${index + 1}】\n${item}`).join("\n\n");
      }
      return error;
    }
    return new StructuredOutputError(
      error instanceof Error ? error.message : String(error),
      attempts.length > 1
        ? attempts.map((item, index) => `【尝试 ${index + 1}】\n${item}`).join("\n\n")
        : rawOutput,
      { attempts: attempts.slice() },
    );
  }

  requestJsonWithHardTimeout(url, payload, timeoutMs, abortSignal = null, method = "POST") {
    return new Promise((resolve, reject) => {
      if (abortSignal && abortSignal.aborted) {
        reject(new TaskCancelledError());
        return;
      }
      let parsed;
      try {
        parsed = new URL(url);
      } catch (_) {
        reject(new Error(`无效 API URL：${url}`));
        return;
      }

      const transport = parsed.protocol === "https:" ? require("https") : require("http");
      if (!["http:", "https:"].includes(parsed.protocol)) {
        reject(new Error(`不支持的 API 协议：${parsed.protocol}`));
        return;
      }
      const normalizedMethod = String(method || "POST").toUpperCase();
      const hasBody = normalizedMethod !== "GET" && payload !== null && payload !== undefined;
      const body = hasBody ? JSON.stringify(payload) : "";
      const headers = {
        Authorization: `Bearer ${String(this.settings.apiKey || "").trim()}`,
      };
      if (hasBody) {
        headers["Content-Type"] = "application/json";
        headers["Content-Length"] = Buffer.byteLength(body);
      }

      let settled = false;
      let hardTimer = null;
      let abortHandler = null;
      const finish = (fn, value, req) => {
        if (settled) return;
        settled = true;
        if (hardTimer !== null) window.clearTimeout(hardTimer);
        if (abortSignal && abortHandler) abortSignal.removeEventListener("abort", abortHandler);
        if (req && this.activeHttpRequests) this.activeHttpRequests.delete(req);
        fn(value);
      };

      const req = transport.request({
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: `${parsed.pathname}${parsed.search}`,
        method: normalizedMethod,
        headers,
      }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : {}; } catch (_) { json = null; }
          finish(resolve, { status: Number(res.statusCode || 0), text, json, headers: res.headers || {} }, req);
        });
      });

      this.activeHttpRequests.add(req);
      abortHandler = () => req.destroy(new TaskCancelledError());
      if (abortSignal) abortSignal.addEventListener("abort", abortHandler, { once: true });
      hardTimer = window.setTimeout(() => {
        req.destroy(new Error(`API 请求超时（${Math.round(timeoutMs / 1000)} 秒）`));
      }, timeoutMs);
      req.on("error", (error) => finish(reject, error, req));
      if (hasBody) req.write(body);
      req.end();
    });
  }

  async chat(system, user, context = {}, requestOptions = {}) {
    return this.enqueueApiRequest(async () => {
      const baseUrl = String(this.settings.baseUrl || DEFAULT_SETTINGS.baseUrl).replace(/\/+$/, "");
      const timeoutMs = Math.max(1, Number(this.settings.requestTimeoutSeconds) || 180) * 1000;
      const payload = {
        model: String(this.settings.model || "auto").trim() || "auto",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
      };
      if (requestOptions.jsonMode === true && this.settings.structuredJsonModeEnabled !== false) {
        // OpenAI 兼容 JSON 模式。Ollama /v1/chat/completions 支持 JSON mode；字段结构、合法值、权重与最大 Tag 数等语义约束仍由本地再次校验。
        payload.response_format = { type: "json_object" };
      }
      const response = await this.requestJsonWithHardTimeout(`${baseUrl}/chat/completions`, payload, timeoutMs, context.abortSignal || null);
      this.ensureTaskActive(context.abortSignal);

      if (response.status < 200 || response.status >= 300) {
        const detail = (response.text || "").slice(0, 500) || `HTTP ${response.status}`;
        throw new Error(`API ${response.status}: ${detail}`);
      }
      const data = response.json || {};
      if (data.error && data.error.message) throw new Error(data.error.message);
      const content = data.choices?.[0]?.message?.content;
      if (typeof content === "string") return content.trim();
      if (Array.isArray(content)) {
        return content.map((part) => (part && typeof part.text === "string" ? part.text : "")).join("").trim();
      }
      throw new Error("API 返回中没有 choices[0].message.content");
    }, context);
  }

  hasNonEmptyFrontmatterField(file, key) {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
    const value = fm[key];
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    return String(value).trim().length > 0;
  }

  hasNonEmptySummaryShort(file) {
    return this.hasNonEmptyFrontmatterField(file, "AI_summary_short");
  }

  hasNonEmptySummaryLong(file) {
    return this.hasNonEmptyFrontmatterField(file, "AI_summary_long");
  }

  hasNonEmptyTags(file) {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
    const value = fm.AI_tags;
    if (Array.isArray(value)) return value.some((item) => String(item ?? "").trim().length > 0);
    if (value === null || value === undefined) return false;
    return String(value).trim().length > 0;
  }

  hasValidTechnicalDepth(file) {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
    const numeric = Number(fm.AI_technical_depth);
    return Number.isInteger(numeric) && numeric >= 0 && numeric <= 100;
  }

  hasNonEmptyQa(file) {
    return this.hasNonEmptyFrontmatterField(file, "AI_qa");
  }

  hasNonEmptyTitle(file) {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
    const value = fm.AI_title;
    if (Array.isArray(value)) return value.some((item) => String(item ?? "").trim().length > 0);
    if (value === null || value === undefined) return false;
    return String(value).trim().length > 0;
  }

  getMetadataCompletion(file, fingerprint) {
    const record = this.state.files[file.path] || {};
    if (this.settings.contentFingerprintEnabled === true) {
      return {
        titleDone: Boolean(fingerprint) && record.lastTitleHash === fingerprint,
        summaryShortDone: Boolean(fingerprint) && record.lastSummaryShortHash === fingerprint,
        summaryLongDone: Boolean(fingerprint) && record.lastSummaryLongHash === fingerprint,
        tagsDone: Boolean(fingerprint) && record.lastTagsHash === fingerprint,
        technicalDepthDone: Boolean(fingerprint) && record.lastTechnicalDepthHash === fingerprint,
        qaDone: Boolean(fingerprint) && record.lastQaHash === fingerprint,
      };
    }
    return {
      titleDone: this.hasNonEmptyTitle(file),
      summaryShortDone: this.hasNonEmptySummaryShort(file),
      summaryLongDone: this.hasNonEmptySummaryLong(file),
      tagsDone: this.hasNonEmptyTags(file),
      technicalDepthDone: this.hasValidTechnicalDepth(file),
      qaDone: this.hasNonEmptyQa(file),
    };
  }

  clearPersistentFingerprintMarkers() {
    const files = this.state && this.state.files ? this.state.files : {};
    for (const record of Object.values(files)) {
      if (!record || typeof record !== "object") continue;
      delete record.lastSeenSourceHash;
      delete record.lastSummaryHash;
      delete record.lastSummaryShortHash;
      delete record.lastSummaryLongHash;
      delete record.lastTagsHash;
      delete record.lastTechnicalDepthHash;
      delete record.lastQaHash;
      delete record.lastTitleHash;
    }
  }

  async initializeFingerprintBaseline() {
    const files = this.getRecognitionFiles();
    for (const file of files) {
      try {
        const raw = await this.app.vault.cachedRead(file);
        const fingerprint = this.computeSourceFingerprint(raw, file);
        const record = this.state.files[file.path] || {};
        if (this.hasNonEmptySummaryShort(file)) record.lastSummaryShortHash = fingerprint;
        else delete record.lastSummaryShortHash;
        if (this.hasNonEmptySummaryLong(file)) record.lastSummaryLongHash = fingerprint;
        else delete record.lastSummaryLongHash;
        if (this.hasNonEmptyTags(file)) record.lastTagsHash = fingerprint;
        else delete record.lastTagsHash;
        if (this.hasValidTechnicalDepth(file)) record.lastTechnicalDepthHash = fingerprint;
        else delete record.lastTechnicalDepthHash;
        if (this.hasNonEmptyQa(file)) record.lastQaHash = fingerprint;
        else delete record.lastQaHash;
        if (this.hasNonEmptyTitle(file)) record.lastTitleHash = fingerprint;
        else delete record.lastTitleHash;
        this.state.files[file.path] = record;
      } catch (error) {
        console.warn("xyblue135 私人·AI 元数据：初始化内容指纹基线失败", file.path, error);
      }
    }
  }

  markProcessed(file, fingerprint, kindOrKinds) {
    const record = this.state.files[file.path] || {};
    const kinds = Array.isArray(kindOrKinds)
      ? kindOrKinds
      : kindOrKinds === "all"
        ? ["summary_short", "summary_long", "tags", "technical_depth", "qa", "ai_title"]
        : [kindOrKinds];

    if (this.settings.contentFingerprintEnabled === true) {
      if (kinds.includes("summary_short")) record.lastSummaryShortHash = fingerprint;
      if (kinds.includes("summary_long")) record.lastSummaryLongHash = fingerprint;
      if (kinds.includes("tags")) record.lastTagsHash = fingerprint;
      if (kinds.includes("technical_depth")) record.lastTechnicalDepthHash = fingerprint;
      if (kinds.includes("qa")) record.lastQaHash = fingerprint;
      if (kinds.includes("ai_title")) record.lastTitleHash = fingerprint;
    } else {
      delete record.lastSummaryHash;
      delete record.lastSummaryShortHash;
      delete record.lastSummaryLongHash;
      delete record.lastTagsHash;
      delete record.lastTechnicalDepthHash;
      delete record.lastQaHash;
      delete record.lastTitleHash;
    }
    // 成功后只清理真正会被 UI 使用的错误状态；不再保存审计时间、来源、reason、tag scores 或 updateLog。
    record.lastError = "";
    record.lastErrorType = "";
    record.lastRawModelOutput = "";
    this.state.files[file.path] = record;
    this.scheduleStateSave();
  }

  async setAutoUpdateEnabled(enabled, options = {}) {
    const next = enabled === true;
    const changed = this.settings.autoUpdateEnabled !== next;
    this.settings.autoUpdateEnabled = next;

    // 每次定时自动任务拥有独立 AbortController。关闭自动更新时，不仅取消下一次定时器，
    // 也会中止当前自动周期正在等待的 HTTP 请求或队列 sleep；手动文件夹任务不受影响。
    if (!next && options.abortRunningAuto !== false && this.cycleMode === "auto" && this.autoRunController) {
      try { this.autoRunController.abort(); } catch (_) {}
    }

    if (changed) await this.saveAllData();
    this.restartAutoScheduler();
    if (options.showNotice === true) {
      new Notice(`xyblue135 私人·AI 元数据：自动更新已${next ? "开启" : "关闭"}`);
    }
    return next;
  }

  restartAutoScheduler() {
    if (this.autoTimeoutId !== null) {
      window.clearTimeout(this.autoTimeoutId);
      this.autoTimeoutId = null;
    }
    this.nextAutoRunAt = 0;

    if (!this.settings.autoUpdateEnabled) {
      if (!this.autoRunning) this.setRuntimeStatus("idle");
      this.refreshStatusBar();
      return;
    }

    // 当前周期仍在运行时绝不启动下一轮倒计时；只有全部请求和写入完成后，
    // 才会在 finally 中安排下一次自动运行。
    if (this.autoRunning) {
      this.refreshStatusBar();
      return;
    }
    this.scheduleNextAutoRun();
  }

  scheduleNextAutoRun() {
    if (this.autoTimeoutId !== null) {
      window.clearTimeout(this.autoTimeoutId);
      this.autoTimeoutId = null;
    }
    if (!this.settings.autoUpdateEnabled || this.unloading || this.autoRunning) {
      this.nextAutoRunAt = 0;
      this.refreshStatusBar();
      return;
    }

    const minutes = Math.max(5, Number(this.settings.autoUpdateMinutes) || 60);
    const delayMs = minutes * 60 * 1000;
    this.nextAutoRunAt = Date.now() + delayMs;
    this.autoTimeoutId = window.setTimeout(() => {
      this.autoTimeoutId = null;
      this.nextAutoRunAt = 0;
      void this.runAutoUpdateCycle(false);
    }, delayMs);
    this.refreshStatusBar();
  }

  normalizeFolderPath(folderPath) {
    const root = this.normalizeWhitelistFolder();
    const normalized = String(folderPath || root)
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\/+|\/+$/g, "") || root;
    if (normalized === root || normalized.startsWith(`${root}/`)) return normalized;
    return root;
  }

  getFolderPathForFile(file) {
    const slash = file.path.lastIndexOf("/");
    return slash >= 0 ? file.path.slice(0, slash) : this.normalizeWhitelistFolder();
  }

  getFilesInFolder(folderPath) {
    const folder = this.normalizeFolderPath(folderPath);
    return this.getRecognitionFiles().filter((file) => {
      const parent = this.getFolderPathForFile(file);
      return parent === folder || parent.startsWith(`${folder}/`);
    });
  }

  makeNotePreview(raw, maxChars = 140) {
    let text = String(raw || "");
    if (text.startsWith("---")) {
      const end = text.indexOf("\n---", 3);
      if (end >= 0) text = text.slice(end + 4);
    }
    text = text
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/[*_~>|]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.length > maxChars ? `${text.slice(0, maxChars).trim()}…` : text;
  }

  async inspectMetadataFile(file, includePreview = false) {
    try {
      const raw = await this.app.vault.cachedRead(file);
      const fingerprint = this.computeSourceFingerprint(raw, file);
      const record = this.state.files[file.path] || {};
      const body = this.stripFrontmatter(raw).trim();
      const emptyBody = !body;
      const { titleDone, summaryShortDone, summaryLongDone, tagsDone, technicalDepthDone, qaDone } = this.getMetadataCompletion(file, fingerprint);
      return {
        file,
        folder: this.getFolderPathForFile(file),
        fingerprint,
        titleDone,
        summaryShortDone,
        summaryLongDone,
        tagsDone,
        technicalDepthDone,
        qaDone,
        emptyBody,
        pending: !emptyBody && (!titleDone || !summaryShortDone || !summaryLongDone || !tagsDone || !technicalDepthDone || !qaDone),
        preview: includePreview ? (emptyBody ? "（无可分析正文）" : this.makeNotePreview(raw)) : "",
        lastError: emptyBody ? "" : (record.lastError || ""),
        lastErrorType: record.lastErrorType || "",
        lastRawModelOutput: record.lastRawModelOutput || "",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        file,
        folder: this.getFolderPathForFile(file),
        fingerprint: "",
        titleDone: false,
        summaryShortDone: false,
        summaryLongDone: false,
        tagsDone: false,
        technicalDepthDone: false,
        qaDone: false,
        pending: true,
        preview: "读取预览失败",
        lastError: message,
      };
    }
  }

  async getPendingDashboardData(includePreview = true) {
    const allFiles = this.getNotesFiles();
    const files = this.settings.statusDoneOnlyEnabled === true
      ? allFiles.filter((file) => this.isRecognitionEligible(file))
      : allFiles;
    const statusFilteredSkipped = Math.max(0, allFiles.length - files.length);
    const infos = [];
    const groups = new Map();
    const root = this.normalizeWhitelistFolder();
    let pending = 0;
    let done = 0;
    let emptySkipped = 0;

    const ensureGroup = (folder) => {
      if (!groups.has(folder)) {
        groups.set(folder, {
          folder,
          total: 0,
          pending: 0,
          done: 0,
          emptySkipped: 0,
          recursiveTotal: 0,
          recursivePending: 0,
          recursiveDone: 0,
          recursiveEmptySkipped: 0,
          files: [],
        });
      }
      return groups.get(folder);
    };

    ensureGroup(root);
    for (const file of files) {
      const info = await this.inspectMetadataFile(file, includePreview);
      infos.push(info);
      if (info.emptyBody) emptySkipped += 1;
      else if (info.pending) pending += 1;
      else done += 1;

      const direct = ensureGroup(info.folder);
      direct.total += 1;
      if (info.emptyBody) direct.emptySkipped += 1;
      else if (info.pending) direct.pending += 1;
      else direct.done += 1;
      direct.files.push(info);

      // 补齐祖先目录节点，即使 Markdown 全部位于更深层子目录，也能选择父目录进行识别。
      let cursor = info.folder;
      while (cursor && cursor !== root) {
        const slash = cursor.lastIndexOf("/");
        cursor = slash >= 0 ? cursor.slice(0, slash) : root;
        if (cursor === root || cursor.startsWith(`${root}/`)) ensureGroup(cursor);
        if (cursor === root) break;
      }
    }

    for (const group of groups.values()) {
      for (const info of infos) {
        if (info.folder === group.folder || info.folder.startsWith(`${group.folder}/`)) {
          group.recursiveTotal += 1;
          if (info.emptyBody) group.recursiveEmptySkipped += 1;
          else if (info.pending) group.recursivePending += 1;
          else group.recursiveDone += 1;
        }
      }
      group.files.sort((a, b) => {
        if (a.pending !== b.pending) return a.pending ? -1 : 1;
        return a.file.path.localeCompare(b.file.path, "zh-CN");
      });
    }

    const folders = Array.from(groups.values()).sort((a, b) => {
      if ((a.recursivePending > 0) !== (b.recursivePending > 0)) return a.recursivePending > 0 ? -1 : 1;
      const depthA = a.folder.split("/").length;
      const depthB = b.folder.split("/").length;
      if (depthA !== depthB) return depthA - depthB;
      return a.folder.localeCompare(b.folder, "zh-CN");
    });
    return {
      total: files.length,
      whitelistTotal: allFiles.length,
      statusFilteredSkipped,
      statusFilterEnabled: this.settings.statusDoneOnlyEnabled === true,
      pending,
      done,
      emptySkipped,
      folders,
    };
  }

  openPendingNotesDashboard() {
    new PendingNotesDashboardModal(this.app, this).open();
  }

  async retrySingleMetadataFile(file, showNotice = true) {
    if (!(file instanceof TFile) || file.extension !== "md" || !this.isWhitelisted(file)) {
      if (showNotice) new Notice("xyblue135 私人·AI 元数据：只能重试白名单目录中的 Markdown");
      return { success: false, message: "文件不在白名单" };
    }
    if (this.autoRunning || this.fileBusy.has(file.path)) {
      if (showNotice) new Notice("xyblue135 私人·AI 元数据：已有任务正在运行，请稍后重试");
      return { success: false, message: "已有任务正在运行" };
    }
    if (!String(this.settings.apiKey || "").trim()) {
      if (showNotice) new Notice("xyblue135 私人·AI 元数据：API Key 为空，无法重试");
      return { success: false, message: "API Key 为空" };
    }

    if (this.autoTimeoutId !== null) {
      window.clearTimeout(this.autoTimeoutId);
      this.autoTimeoutId = null;
    }
    this.nextAutoRunAt = 0;
    this.autoRunning = true;
    this.cycleMode = "manual-single-retry";
    this.fileBusy.add(file.path);
    try {
      await this.generateAllForFile(file, "manual-retry", { index: 1, total: 1 });
      await this.saveAllData();
      if (showNotice) new Notice(`xyblue135 私人·AI 元数据：重试成功：${file.basename}`);
      return { success: true, message: "重试成功" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const record = this.state.files[file.path] || {};
      if (error && error.code === "EMPTY_BODY") {
        record.lastError = "";
        record.lastErrorType = "";
        record.lastRawModelOutput = "";
        this.state.files[file.path] = record;
        await this.saveAllData();
        if (showNotice) new Notice(`xyblue135 私人·AI 元数据：跳过 ${file.basename}：无可分析正文`);
        return { success: false, skipped: true, message: "无可分析正文" };
      }
      record.lastError = message.slice(0, 1000);
      record.lastErrorType = error && error.code ? String(error.code) : "ERROR";
      record.lastRawModelOutput = error && error.rawOutput ? String(error.rawOutput).slice(0, 16000) : "";
      this.state.files[file.path] = record;
      await this.saveAllData();
      if (showNotice) new Notice(`xyblue135 私人·AI 元数据：重试仍失败：${message}`, 7000);
      return { success: false, message, rawOutput: record.lastRawModelOutput };
    } finally {
      this.fileBusy.delete(file.path);
      this.autoRunning = false;
      this.cycleMode = null;
      if (!this.unloading) {
        this.setRuntimeStatus("idle");
        if (this.settings.autoUpdateEnabled) this.scheduleNextAutoRun();
        else this.refreshStatusBar();
      }
    }
  }

  async runPendingFolder(folderPath, showNotice = true, onProgress = null) {
    const folder = this.normalizeFolderPath(folderPath);
    const root = this.normalizeWhitelistFolder();
    if (folder === root) {
      if (showNotice) new Notice("xyblue135 私人·AI 元数据：请选择 00_docs 下的具体子文件夹；根目录不提供‘处理全部待更新’入口");
      return null;
    }
    if (this.autoRunning) {
      if (showNotice) new Notice("xyblue135 私人·AI 元数据：已有自动/文件夹同步任务正在运行");
      return null;
    }
    if (!String(this.settings.apiKey || "").trim()) {
      if (showNotice) new Notice("xyblue135 私人·AI 元数据：API Key 为空，无法同步文件夹");
      return null;
    }

    if (this.autoTimeoutId !== null) {
      window.clearTimeout(this.autoTimeoutId);
      this.autoTimeoutId = null;
    }
    this.nextAutoRunAt = 0;
    this.autoRunning = true;
    this.cycleMode = "manual-folder";
    const controller = new AbortController();
    const run = { folder, controller, startedAt: Date.now() };
    this.manualFolderRun = run;
    this.setRuntimeStatus("scanning", { phase: `扫描 ${folder}` });

    const processedFiles = [];
    const failedFiles = [];
    const skippedFiles = [];
    let cancelled = false;
    try {
      const candidates = this.getFilesInFolder(folder);
      const pendingFiles = [];
      for (const file of candidates) {
        this.ensureTaskActive(controller.signal);
        const info = await this.inspectMetadataFile(file, false);
        if (info.emptyBody) {
          skippedFiles.push({ path: file.path, message: "无可分析正文", kind: "empty-body" });
        } else if (info.pending) {
          pendingFiles.push({
            file,
            queuedPath: file.path,
            titleDone: info.titleDone,
            summaryShortDone: info.summaryShortDone,
            summaryLongDone: info.summaryLongDone,
            tagsDone: info.tagsDone,
            technicalDepthDone: info.technicalDepthDone,
            qaDone: info.qaDone,
          });
        }
      }

      if (typeof onProgress === "function") onProgress({ phase: "start", folder, total: pendingFiles.length });

      if (!pendingFiles.length) {
        this.lastCycleSummary = `${folder}：没有待更新笔记；跳过无正文 ${skippedFiles.length}`;
        await this.saveAllData();
        if (showNotice) new Notice(`xyblue135 私人·AI 元数据：${folder} 当前没有待更新笔记；无正文跳过 ${skippedFiles.length}`);
        return { folder, processedFiles, failedFiles, skippedFiles, remaining: 0, cancelled: false };
      }

      for (let index = 0; index < pendingFiles.length; index += 1) {
        if (controller.signal.aborted) {
          cancelled = true;
          break;
        }
        this.ensureLifecycleActive();
        const queued = pendingFiles[index];
        const file = queued.file;
        const progress = { index: index + 1, total: pendingFiles.length };

        // v0.5.0 范围漂移保护：队列只是启动时快照，文件当前路径才是最终依据；任务开始后移出所选目录的文件会直接跳过。
        try {
          this.assertFileStillInFolder(file, folder);
          this.assertRecognitionEligible(file);
        } catch (error) {
          const message = error && error.code === "FILE_LEFT_SCOPE"
            ? "任务执行期间文件已移出当前识别目录"
            : error && error.code === "STATUS_NOT_DONE"
              ? "文章 status 已不再是 done，按元数据校验规则跳过"
              : (error instanceof Error ? error.message : String(error));
          const path = file && file.path ? file.path : queued.queuedPath;
          skippedFiles.push({
            path,
            originalPath: queued.queuedPath,
            message,
            kind: error && error.code === "FILE_LEFT_SCOPE"
              ? "moved-out"
              : error && error.code === "STATUS_NOT_DONE"
                ? "status-filtered"
                : "unavailable",
          });
          if (typeof onProgress === "function") onProgress({ phase: "skipped", folder, filePath: path, message, ...progress });
          continue;
        }

        const currentPath = file.path;
        if (typeof onProgress === "function") onProgress({ phase: "processing", folder, filePath: currentPath, ...progress });
        if (this.fileBusy.has(currentPath)) {
          skippedFiles.push({ path: currentPath, message: "文件正在处理中", kind: "busy" });
          if (typeof onProgress === "function") onProgress({ phase: "skipped", folder, filePath: currentPath, message: "文件正在处理中", ...progress });
          continue;
        }
        const busyPath = currentPath;
        this.fileBusy.add(busyPath);
        try {
          const taskContext = {
            abortSignal: controller.signal,
            scopeFolder: folder,
            respectStatusFilter: true,
          };
          const missingKinds = [];
          if (!queued.titleDone) missingKinds.push("ai_title");
          if (!queued.summaryShortDone) missingKinds.push("summary_short");
          if (!queued.summaryLongDone) missingKinds.push("summary_long");
          if (!queued.tagsDone) missingKinds.push("tags");
          if (!queued.technicalDepthDone) missingKinds.push("technical_depth");
          if (!queued.qaDone) missingKinds.push("qa");
          if (missingKinds.length) {
            await this.generateSelectedForFile(file, missingKinds, "manual-folder", progress, taskContext);
          } else {
            skippedFiles.push({ path: file.path, message: "AI_title / AI_summary_short / AI_summary_long / AI_tags / AI_technical_depth / AI_qa 已有内容", kind: "already-complete" });
            continue;
          }
          processedFiles.push(file.path);
          if (typeof onProgress === "function") onProgress({ phase: "success", folder, filePath: file.path, ...progress });
        } catch (error) {
          if (this.unloading) throw error;
          if (controller.signal.aborted || (error && error.code === "TASK_CANCELLED")) {
            cancelled = true;
            if (typeof onProgress === "function") onProgress({ phase: "stopping", folder, filePath: file.path, ...progress });
            break;
          }
          if (error && ["FILE_LEFT_SCOPE", "FILE_UNAVAILABLE", "STATUS_NOT_DONE"].includes(error.code)) {
            const message = error.code === "FILE_LEFT_SCOPE"
              ? "任务执行期间文件已移出当前识别目录"
              : error.code === "STATUS_NOT_DONE"
                ? "文章 status 已不再是 done，按元数据校验规则跳过"
                : error.message;
            const kind = error.code === "FILE_LEFT_SCOPE"
              ? "moved-out"
              : error.code === "STATUS_NOT_DONE"
                ? "status-filtered"
                : "unavailable";
            skippedFiles.push({ path: file.path || queued.queuedPath, originalPath: queued.queuedPath, message, kind });
            if (typeof onProgress === "function") onProgress({ phase: "skipped", folder, filePath: file.path || queued.queuedPath, message, ...progress });
            continue;
          }
          const message = error instanceof Error ? error.message : String(error);
          const recordPath = file.path || queued.queuedPath;
          const record = this.state.files[recordPath] || {};
          if (error && error.code === "EMPTY_BODY") {
            record.lastError = "";
            record.lastErrorType = "";
            record.lastRawModelOutput = "";
            skippedFiles.push({ path: recordPath, message: "无可分析正文", kind: "empty-body" });
            if (typeof onProgress === "function") onProgress({ phase: "skipped", folder, filePath: recordPath, message: "无可分析正文", ...progress });
          } else {
            record.lastError = message.slice(0, 1000);
            record.lastErrorType = error && error.code ? String(error.code) : "ERROR";
            record.lastRawModelOutput = error && error.rawOutput ? String(error.rawOutput).slice(0, 16000) : "";
            failedFiles.push({ path: recordPath, message, rawOutput: record.lastRawModelOutput, errorType: record.lastErrorType });
            if (typeof onProgress === "function") onProgress({ phase: "error", folder, filePath: recordPath, message, ...progress });
            this.setRuntimeStatus("error", { filePath: recordPath, progress, message });
            console.warn(`xyblue135 私人·AI 元数据 folder sync failed: ${recordPath}`, error);
          }
          this.state.files[recordPath] = record;
        } finally {
          this.fileBusy.delete(busyPath);
          if (file && file.path) this.fileBusy.delete(file.path);
        }
      }

      let remaining = 0;
      for (const file of this.getFilesInFolder(folder)) {
        const info = await this.inspectMetadataFile(file, false);
        if (info.pending) remaining += 1;
      }

      if (cancelled || controller.signal.aborted) {
        cancelled = true;
        if (typeof onProgress === "function") onProgress({ phase: "cancelled", folder, total: pendingFiles.length, processed: processedFiles.length, failed: failedFiles.length, skipped: skippedFiles.length, remaining });
        this.lastCycleSummary = `${folder}：已停止；成功 ${processedFiles.length}，失败 ${failedFiles.length}，跳过 ${skippedFiles.length}，剩余 ${remaining}`;
        await this.saveAllData();
        if (showNotice) new Notice(`xyblue135 私人·AI 元数据：${folder} 已停止；成功 ${processedFiles.length}，失败 ${failedFiles.length}，剩余 ${remaining}`, 7000);
        return { folder, processedFiles, failedFiles, skippedFiles, remaining, cancelled: true };
      }

      if (typeof onProgress === "function") onProgress({ phase: "complete", folder, total: pendingFiles.length, processed: processedFiles.length, failed: failedFiles.length, skipped: skippedFiles.length, remaining });
      this.lastCycleSummary = `${folder}：成功 ${processedFiles.length}，失败 ${failedFiles.length}，跳过 ${skippedFiles.length}，剩余 ${remaining}`;
      await this.saveAllData();
      if (showNotice) {
        new Notice(`xyblue135 私人·AI 元数据：${folder} 同步完成；成功 ${processedFiles.length}，失败 ${failedFiles.length}，剩余 ${remaining}`, 7000);
      }
      return { folder, processedFiles, failedFiles, skippedFiles, remaining, cancelled: false };
    } catch (error) {
      if (controller.signal.aborted || (error && error.code === "TASK_CANCELLED")) {
        cancelled = true;
        let remaining = 0;
        for (const file of this.getFilesInFolder(folder)) {
          const info = await this.inspectMetadataFile(file, false);
          if (info.pending) remaining += 1;
        }
        if (typeof onProgress === "function") onProgress({ phase: "cancelled", folder, processed: processedFiles.length, failed: failedFiles.length, skipped: skippedFiles.length, remaining });
        this.lastCycleSummary = `${folder}：已停止；成功 ${processedFiles.length}，失败 ${failedFiles.length}，跳过 ${skippedFiles.length}，剩余 ${remaining}`;
        await this.saveAllData();
        if (showNotice) new Notice(`xyblue135 私人·AI 元数据：${folder} 已停止；剩余 ${remaining}`, 7000);
        return { folder, processedFiles, failedFiles, skippedFiles, remaining, cancelled: true };
      }
      throw error;
    } finally {
      if (this.manualFolderRun === run) this.manualFolderRun = null;
      this.autoRunning = false;
      this.cycleMode = null;
      if (!this.unloading) {
        this.setRuntimeStatus("idle");
        if (this.settings.autoUpdateEnabled) this.scheduleNextAutoRun();
        else this.refreshStatusBar();
      }
    }
  }

  async runAutoUpdateCycle(showNotice = false) {
    if (!this.settings.autoUpdateEnabled && !showNotice) return;
    if (this.autoRunning) {
      if (showNotice) new Notice("xyblue135 私人·AI 元数据：自动更新扫描已经在运行");
      return;
    }
    if (!String(this.settings.apiKey || "").trim()) {
      if (showNotice) new Notice("xyblue135 私人·AI 元数据：API Key 为空，无法运行自动更新");
      if (this.settings.autoUpdateEnabled) this.scheduleNextAutoRun();
      return;
    }

    if (this.autoTimeoutId !== null) {
      window.clearTimeout(this.autoTimeoutId);
      this.autoTimeoutId = null;
    }
    this.nextAutoRunAt = 0;
    this.autoRunning = true;
    this.cycleMode = showNotice ? "manual-full" : "auto";
    const controller = new AbortController();
    if (!showNotice) this.autoRunController = controller;
    this.setRuntimeStatus("scanning");
    let processed = 0;
    let skipped = 0;
    let failed = 0;
    try {
      const files = this.getRecognitionFiles();
      for (let index = 0; index < files.length; index += 1) {
        this.ensureLifecycleActive();
        this.ensureTaskActive(controller.signal);
        // 定时自动周期运行中关闭自动更新，会在进入下一篇笔记前终止该周期；用户手动触发的扫描仍可继续。
        if (!showNotice && !this.settings.autoUpdateEnabled) break;
        const file = files[index];
        const progress = { index: index + 1, total: files.length };
        if (this.fileBusy.has(file.path)) {
          skipped += 1;
          continue;
        }
        try {
          const prepared = await this.prepareFile(file);
          const { titleDone, summaryShortDone, summaryLongDone, tagsDone, technicalDepthDone, qaDone } = this.getMetadataCompletion(file, prepared.fingerprint);
          if (titleDone && summaryShortDone && summaryLongDone && tagsDone && technicalDepthDone && qaDone) {
            skipped += 1;
            continue;
          }

          this.fileBusy.add(file.path);
          try {
            const taskContext = {
              abortSignal: controller.signal,
              respectStatusFilter: true,
            };
            const missingKinds = [];
            if (!titleDone) missingKinds.push("ai_title");
            if (!summaryShortDone) missingKinds.push("summary_short");
            if (!summaryLongDone) missingKinds.push("summary_long");
            if (!tagsDone) missingKinds.push("tags");
            if (!technicalDepthDone) missingKinds.push("technical_depth");
            if (!qaDone) missingKinds.push("qa");
            if (missingKinds.length) {
              await this.generateSelectedForFile(file, missingKinds, "auto", progress, taskContext);
            } else {
              skipped += 1;
              continue;
            }
            processed += 1;
          } finally {
            this.fileBusy.delete(file.path);
          }
        } catch (error) {
          if (this.unloading) throw error;
          if (!showNotice && (controller.signal.aborted || (error && error.code === "TASK_CANCELLED"))) {
            break;
          }
          const message = error instanceof Error ? error.message : String(error);
          const record = this.state.files[file.path] || {};
          if (error && error.code === "EMPTY_BODY") {
            skipped += 1;
            record.lastError = "";
            record.lastErrorType = "";
            record.lastRawModelOutput = "";
          } else if (error && error.code === "STATUS_NOT_DONE") {
            skipped += 1;
            record.lastError = "";
            record.lastErrorType = "";
            record.lastRawModelOutput = "";
          } else {
            failed += 1;
            record.lastError = message.slice(0, 1000);
            record.lastErrorType = error && error.code ? String(error.code) : "ERROR";
            record.lastRawModelOutput = error && error.rawOutput ? String(error.rawOutput).slice(0, 16000) : "";
            this.setRuntimeStatus("error", { filePath: file.path, progress, message });
            console.warn(`xyblue135 私人·AI 元数据 auto update failed: ${file.path}`, error);
          }
          this.state.files[file.path] = record;
        }
      }
      this.lastCycleSummary = `上轮：更新 ${processed}，跳过 ${skipped}，失败 ${failed}`;
      await this.saveAllData();
      if (showNotice) {
        new Notice(`xyblue135 私人·AI 元数据：扫描完成，更新 ${processed}，跳过 ${skipped}，失败 ${failed}`, 6000);
      }
    } finally {
      if (this.autoRunController === controller) this.autoRunController = null;
      this.autoRunning = false;
      this.cycleMode = null;
      if (!this.unloading) {
        this.setRuntimeStatus("idle");
        // 关键调度规则：只有整个周期（summary_short + summary_long + tags + technical_depth + 写入）完全结束后，才从这里开始计算下一次间隔。
        if (this.settings.autoUpdateEnabled) this.scheduleNextAutoRun();
        else this.refreshStatusBar();
      }
    }
  }

  sleep(ms, abortSignal = null) {
    return new Promise((resolve, reject) => {
      if (abortSignal && abortSignal.aborted) {
        reject(new TaskCancelledError());
        return;
      }
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        if (abortSignal && onAbort) abortSignal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        abortSignal.removeEventListener("abort", onAbort);
        reject(new TaskCancelledError());
      };
      if (abortSignal) abortSignal.addEventListener("abort", onAbort, { once: true });
    });
  }

  async getAutoStatus() {
    const data = await this.getPendingDashboardData(false);
    return { total: data.total, pending: data.pending, done: data.done, emptySkipped: data.emptySkipped || 0 };
  }

  setButtonState(button, state) {
    if (!button || !button.isConnected) return;
    button.removeClass("is-loading", "is-success", "is-error");
    if (state === "loading") {
      button.addClass("is-loading");
      setIcon(button, "loader-circle");
      button.setAttribute("aria-label", "AI 生成中…");
    } else if (state === "success") {
      button.addClass("is-success");
      setIcon(button, "check");
      button.setAttribute("aria-label", "AI 生成成功");
    } else if (state === "error") {
      button.addClass("is-error");
      setIcon(button, "circle-alert");
      button.setAttribute("aria-label", "AI 生成失败");
    } else {
      setIcon(button, "sparkles");
      const kind = button.getAttribute("data-ai-kind") || "metadata";
      if (kind === "summary_short") button.setAttribute("aria-label", "AI 只生成 AI_summary_short");
      else if (kind === "summary_long") button.setAttribute("aria-label", "AI 只生成 AI_summary_long");
      else if (kind === "tags") button.setAttribute("aria-label", "AI 只生成 weighted tags");
      else if (kind === "technical_depth") button.setAttribute("aria-label", "AI 只评估 AI_technical_depth");
      else if (kind === "qa") button.setAttribute("aria-label", "AI 只生成面试问答 AI_qa");
      else if (kind === "ai_title") button.setAttribute("aria-label", "AI 只生成参考标题 AI_title");
      else button.setAttribute("aria-label", `AI 生成 ${kind}`);
    }
  }

  async testConnection() {
    return this.enqueueApiRequest(async () => {
      const rawBaseUrl = String(this.settings.baseUrl || "").trim().replace(/\/+$/, "");
      const apiKey = String(this.settings.apiKey || "").trim();
      const selectedModel = String(this.settings.model || "auto").trim() || "auto";
      if (!rawBaseUrl) throw new Error("Base URL 为空");
      let parsedBase;
      try { parsedBase = new URL(rawBaseUrl); } catch (_) { throw new Error(`无效 Base URL：${rawBaseUrl}`); }
      if (!["http:", "https:"].includes(parsedBase.protocol)) {
        throw new Error(`Base URL 只支持 http/https：${parsedBase.protocol}`);
      }
      if (!apiKey) throw new Error("API Key 为空");

      const timeoutMs = Math.max(1, Number(this.settings.requestTimeoutSeconds) || 180) * 1000;

      // 阶段 1：低成本的能力/鉴权检查。FreeLLMAPI 等 OpenAI 兼容网关通常提供 GET /models；
      // 用于区分 URL、密钥、模型配置错误和真实的推理/路由故障。
      this.setRuntimeStatus("requesting", { phase: "连接测试：models", reason: "manual-test" });
      const modelsResponse = await this.requestJsonWithHardTimeout(`${rawBaseUrl}/models`, null, timeoutMs, null, "GET");
      if (modelsResponse.status < 200 || modelsResponse.status >= 300) {
        const detail = (modelsResponse.text || "").slice(0, 500) || `HTTP ${modelsResponse.status}`;
        throw new Error(`Models API ${modelsResponse.status}: ${detail}`);
      }
      const modelList = Array.isArray(modelsResponse.json?.data) ? modelsResponse.json.data : null;
      if (!modelList) throw new Error("Models API 返回成功，但缺少 data 数组；该接口可能不是标准 OpenAI-compatible /models");
      const modelIds = modelList
        .map((item) => item && typeof item.id === "string" ? item.id : "")
        .filter(Boolean);
      const isVirtualAutoModel = selectedModel === "auto" || selectedModel.startsWith("auto:");
      if (!isVirtualAutoModel && modelIds.length > 0 && !modelIds.includes(selectedModel)) {
        throw new Error(`模型 ${selectedModel} 不在 /models 返回列表中（当前返回 ${modelIds.length} 个模型）`);
      }

      // 阶段 2：真实端到端推理检查。/models 正常并不代表当前上游 Provider 一定能完成推理。
      this.setRuntimeStatus("requesting", { phase: "连接测试：chat", reason: "manual-test" });
      const payload = {
        model: selectedModel,
        messages: [
          { role: "system", content: "只做 API 连通性测试。" },
          { role: "user", content: "只回复：OK" },
        ],
        temperature: 0,
        max_tokens: 8,
      };
      const chatResponse = await this.requestJsonWithHardTimeout(`${rawBaseUrl}/chat/completions`, payload, timeoutMs);
      if (chatResponse.status < 200 || chatResponse.status >= 300) {
        const detail = (chatResponse.text || "").slice(0, 500) || `HTTP ${chatResponse.status}`;
        throw new Error(`Chat API ${chatResponse.status}: ${detail}`);
      }
      const data = chatResponse.json || {};
      if (data.error && data.error.message) throw new Error(data.error.message);
      const content = data.choices?.[0]?.message?.content;
      let reply = "";
      if (typeof content === "string") reply = content.trim();
      else if (Array.isArray(content)) {
        reply = content.map((part) => (part && typeof part.text === "string" ? part.text : "")).join("").trim();
      } else {
        throw new Error("Chat API 返回中没有 choices[0].message.content");
      }

      return {
        ok: true,
        modelCount: modelIds.length,
        selectedModel,
        modelListed: isVirtualAutoModel ? null : modelIds.includes(selectedModel),
        reply,
        routedVia: String(chatResponse.headers?.["x-routed-via"] || "").trim(),
      };
    }, { phase: "连接测试", reason: "manual-test" });
  }
};

class AiMetadataSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.activeGroup = "global";
    this.groupOrder = ["global", "ai_title", "tags", "summary_short", "summary_long", "technical_depth", "qa"];
    this.groupLabels = {
      global: "全局设置（API / 扫描 / Tag 规则）",
      ai_title: "参考标题 AI Title",
      tags: "标签 AI Tags",
      summary_short: "短摘要 AI Summary Short",
      summary_long: "长摘要 AI Summary Long",
      technical_depth: "技术深度 AI Technical Depth",
      qa: "面试问答 AI QA",
    };
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("ai-metadata-settings-panel");
    const hero = containerEl.createDiv({ cls: "ai-metadata-settings-hero" });
    const heroText = hero.createDiv({ cls: "ai-metadata-settings-hero-text" });
    heroText.createEl("h2", { text: "xyblue135 私人 · AI 元数据" });
    heroText.createEl("p", {
      text: "更清晰地控制 API、扫描范围、自动识别与本地 Tag 规则。",
      cls: "setting-item-description",
    });
    const heroChips = hero.createDiv({ cls: "ai-metadata-settings-chips" });
    heroChips.createSpan({
      text: this.plugin.settings.statusDoneOnlyEnabled === true ? "扫描：仅 done" : "扫描：全部文章",
      cls: "ai-metadata-settings-chip",
    });
    heroChips.createSpan({
      text: this.plugin.settings.autoUpdateEnabled === true ? "自动更新：开" : "自动更新：关",
      cls: "ai-metadata-settings-chip",
    });
    heroChips.createSpan({
      text: `模型：${this.plugin.settings.model || "auto"}`,
      cls: "ai-metadata-settings-chip",
    });

    containerEl.createEl("h3", { text: "API 连接" });
    new Setting(containerEl)
      .setName("API 基础地址（Base URL）")
      .setDesc("兼容 OpenAI 的 API 基础地址；正常生成请求 /chat/completions，测试连接会先检查 /models。")
      .addText((text) => text.setValue(this.plugin.settings.baseUrl).onChange(async (value) => {
        this.plugin.settings.baseUrl = value.trim();
        await this.plugin.saveAllData();
      }));

    new Setting(containerEl)
      .setName("API 密钥（API Key）")
      .setDesc("仅保存在当前 Vault 的插件 data.json 中。")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setValue(this.plugin.settings.apiKey).onChange(async (value) => {
          this.plugin.settings.apiKey = value.trim();
          await this.plugin.saveAllData();
        });
      });

    new Setting(containerEl)
      .setName("模型（Model）")
      .setDesc("代理支持 auto 时可直接使用 auto。")
      .addText((text) => text.setValue(this.plugin.settings.model).onChange(async (value) => {
        this.plugin.settings.model = value.trim() || "auto";
        await this.plugin.saveAllData();
      }));

    new Setting(containerEl)
      .setName("API 请求超时（秒）")
      .setDesc("默认 180 秒（3 分钟）。每次 API 请求超过该时间，本次更新判定失败且不会写入半成品；实验合并模式下 4 项 AI 元数据合并请求共用这一次超时。")
      .addText((text) => {
        text.inputEl.type = "number";
        text.setValue(String(this.plugin.settings.requestTimeoutSeconds)).onChange(async (value) => {
          const next = Number.parseInt(value, 10);
          if (Number.isFinite(next) && next >= 10 && next <= 1800) {
            this.plugin.settings.requestTimeoutSeconds = next;
            await this.plugin.saveAllData();
            this.plugin.refreshStatusBar();
          }
        });
      });

    new Setting(containerEl)
      .setName("API 请求间隔（秒）")
      .setDesc("默认 30 秒。所有 API 请求进入同一个串行队列，绝不并发；上一请求完成后至少等待该时间才启动下一请求。实验合并模式可把同一篇笔记的 多项元数据从多次请求减少为一次。")
      .addText((text) => {
        text.inputEl.type = "number";
        text.setValue(String(this.plugin.settings.requestIntervalSeconds)).onChange(async (value) => {
          const next = Number.parseInt(value, 10);
          if (Number.isFinite(next) && next >= 0 && next <= 600) {
            this.plugin.settings.requestIntervalSeconds = next;
            await this.plugin.saveAllData();
            this.plugin.refreshStatusBar();
          }
        });
      });

    new Setting(containerEl)
      .setName("Beta：批量合并 4 项结构化元数据请求")
      .setDesc("默认开启，属于 Beta 功能。只作用于 summary_short、summary_long、tags 与 technical_depth 这 4 项结构化元数据：同一篇笔记用一次 /chat/completions 同时得到这 4 项；若只缺其中两项或三项，也会尽量一次请求补齐。面试问答 qa 与参考标题 ai_title 不参与合并，始终各自单独一次请求生成。Properties 中四个字段旁的 ✨ 按钮永远只生成当前字段。关闭后批量流程恢复为 4 个字段串行请求。")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.experimentalCombinedRequestEnabled === true).onChange(async (value) => {
        this.plugin.settings.experimentalCombinedRequestEnabled = value;
        await this.plugin.saveAllData();
        this.plugin.refreshStatusBar();
        this.plugin.clearInjectedButtons();
        this.plugin.scheduleInjection();
      }));

    new Setting(containerEl)
      .setName("结构化 JSON 模式")
      .setDesc("默认开启。对需要 JSON 的 Tags / Technical Depth / 合并请求发送 OpenAI-compatible response_format=json_object，让模型从 API 层优先返回合法 JSON；如果你的代理不支持该字段，可以关闭。")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.structuredJsonModeEnabled !== false).onChange(async (value) => {
        this.plugin.settings.structuredJsonModeEnabled = value;
        await this.plugin.saveAllData();
      }));

    new Setting(containerEl)
      .setName("JSON 修复分支")
      .setDesc("默认开启。严格 JSON.parse 失败时，先在本地做保守修复（缺失对象逗号、尾随逗号、字符串内未转义换行等）并再次解析；关闭后直接进入一次自动结构重试，不执行本地修复。")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.jsonRepairEnabled === true).onChange(async (value) => {
        this.plugin.settings.jsonRepairEnabled = value;
        await this.plugin.saveAllData();
      }));

    new Setting(containerEl)
      .setName("结构化输出自动重试")
      .setDesc("固定开启 1 次：仅在 JSON 解析、summary_short / summary_long 字段、tags 数量/合法性或 technical_depth 分项求和校验失败时重试；网络错误、HTTP 错误和超时不会因为这个分支额外重试。")
      .addButton((button) => button.setButtonText("固定：1 次").setDisabled(true));

    new Setting(containerEl)
      .setName("测试 API")
      .addButton((button) => button.setButtonText("测试连接").onClick(async () => {
        button.setDisabled(true).setButtonText("测试中…");
        try {
          const result = await this.plugin.testConnection();
          const route = result.routedVia ? `；路由：${result.routedVia}` : "";
          const modelInfo = result.modelListed === false ? "；模型未列出" : "";
          new Notice(`xyblue135 私人·AI 元数据：连接成功；/models ${result.modelCount} 个；模型 ${result.selectedModel}${route}${modelInfo}；返回：${String(result.reply).slice(0, 40)}`, 7000);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          new Notice(`xyblue135 私人·AI 元数据：连接失败：${message}`, 7000);
        } finally {
          button.setDisabled(false).setButtonText("测试连接");
          if (!this.plugin.autoRunning && !this.plugin.unloading) this.plugin.setRuntimeStatus("idle");
        }
      }));

    containerEl.createEl("h3", { text: "内容与 Tag 规则" });

    new Setting(containerEl)
      .setName("内容指纹 fingerprint 识别")
      .setDesc("默认关闭。关闭时只按 Properties 是否已有内容判断：summary_short、summary_long、tags、technical_depth 各自有效才视为对应字段已完成，正文后来修改也不会自动判为过期。开启后记录正文内容指纹；正文或其他非 summary/summary_short/summary_long/tags/technical_depth/position 属性变化时，相应 4 项 AI 元数据会重新进入待更新。首次开启会把当前已有有效 summary_short / summary_long / tags / technical_depth 建立为当前基线，不会立即把全部文章重新生成。关闭时会删除数据库中的持久化指纹标记。")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.contentFingerprintEnabled === true).onChange(async (value) => {
        toggle.setDisabled(true);
        try {
          this.plugin.settings.contentFingerprintEnabled = value === true;
          if (value === true) {
            await this.plugin.initializeFingerprintBaseline();
            new Notice("xyblue135 私人·AI 元数据：已开启内容指纹识别，并以当前 4 项 AI 元数据建立基线");
          } else {
            this.plugin.clearPersistentFingerprintMarkers();
            new Notice("xyblue135 私人·AI 元数据：已关闭内容指纹识别，数据库中的指纹标记已删除");
          }
          await this.plugin.saveAllData();
          this.plugin.refreshStatusBar();
        } finally {
          toggle.setDisabled(false);
        }
      }));

    new Setting(containerEl)
      .setName("摘要输入 Markdown 清理")
      .setDesc("默认关闭。开启后在发送 Summary 前清理无意义 Markdown 格式：去除标题 #、反引号/粗体/删除线/引用等格式符，保留其中的文字；删除图片嵌入和链接 URL；超过 500 字符的 fenced 代码块替换为省略提示，短代码保留。Tags 单独生成时仍使用原正文；Beta 合并时 summary_short / summary_long / tags 使用清理后的正文；technical_depth 始终读取未清理的完整正文。")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.summaryMarkdownCleanupEnabled === true).onChange(async (value) => {
        this.plugin.settings.summaryMarkdownCleanupEnabled = value;
        await this.plugin.saveAllData();
      }));

    new Setting(containerEl)
      .setName("白名单目录")
      .setDesc("默认根目录 /00_docs。仅该目录及其子目录中的 .md 显示 AI 图标并参与自动更新。")
      .addText((text) => text.setValue(this.plugin.settings.whitelistFolder).onChange(async (value) => {
        this.plugin.settings.whitelistFolder = value.trim().replace(/^\/+|\/+$/g, "") || "00_docs";
        await this.plugin.saveAllData();
        this.plugin.scheduleInjection();
        this.plugin.scheduleTagCatalogRebuild(100);
      }));

    new Setting(containerEl)
      .setName("标签数量（Tags）")
      .setDesc("这里是 Tags 数量上限，不是必须数量。模型最多返回 N 个合法、唯一、带 weight 的标签；不足 N 个也会按实际数量写入。默认上限 7。")
      .addText((text) => {
        text.inputEl.type = "number";
        text.setValue(String(this.plugin.settings.maxTags)).onChange(async (value) => {
          const next = Number.parseInt(value, 10);
          if (Number.isFinite(next) && next >= 1 && next <= 30) {
            this.plugin.settings.maxTags = next;
            await this.plugin.saveAllData();
          }
        });
      });

    const catalogSetting = new Setting(containerEl)
      .setName("本地 Tag 索引")
      .setDesc("从白名单目录内所有 Markdown 的 frontmatter tags + 行内 #tags 建立，仅用于本地大小写匹配；不会发送给 AI，因此不会增加 Token。层级标签只取最后一级 value。")
      .addButton((button) => button.setButtonText("重新扫描").onClick(async () => {
        button.setDisabled(true).setButtonText("扫描中…");
        try {
          await this.plugin.rebuildTagCatalog();
          new Notice(`xyblue135 私人·AI 元数据：本地 Tag 索引已更新，共 ${Object.keys(this.plugin.state.tagCatalog || {}).length} 个唯一 value`);
          this.display();
        } finally {
          button.setDisabled(false).setButtonText("重新扫描");
        }
      }));
    const catalogEntries = this.plugin.getTagCatalogEntries(40);
    const catalogDetails = containerEl.createEl("details", { cls: "ai-metadata-settings-details" });
    catalogDetails.createEl("summary", {
      text: `查看本地 Tag 索引（${Object.keys(this.plugin.state.tagCatalog || {}).length} 个唯一 value，显示前 ${Math.min(40, catalogEntries.length)} 个）`,
    });
    catalogDetails.createEl("div", {
      cls: "ai-metadata-tag-catalog-preview",
      text: catalogEntries.length ? catalogEntries.map((x) => `${x.value} ×${x.count}`).join("  ·  ") : "暂无标签，点击“重新扫描”。",
    });
    void catalogSetting;

    new Setting(containerEl)
      .setName("标签大小写规范化（Tag）")
      .setDesc("默认开启。AI 返回 Tag 后在本地处理：Vault 已有同名 Tag（忽略大小写）时沿用已有写法；若存在多个历史大小写变体，沿用出现次数最多的写法；Vault 尚无该 Tag 时再使用下方技术词标准写法。")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.tagCaseNormalizationEnabled !== false).onChange(async (value) => {
        this.plugin.settings.tagCaseNormalizationEnabled = value;
        await this.plugin.saveAllData();
      }));

    new Setting(containerEl)
      .setName("技术词规范表")
      .setDesc("每行一个标准 Tag，匹配时忽略大小写，例如 Prometheus、MySQL、GitHub。仅当 Vault 中还没有这个 Tag 时使用；列表完全在本地，不会加入 Prompt。")
      .addTextArea((area) => {
        area.inputEl.rows = 12;
        area.inputEl.addClass("ai-metadata-harness-textarea");
        area.setValue(this.plugin.settings.technicalTagCanonicalList || DEFAULT_TECHNICAL_TAG_CANONICAL_LIST).onChange(async (value) => {
          this.plugin.settings.technicalTagCanonicalList = value;
          await this.plugin.saveAllData();
        });
      })
      .addButton((button) => button.setButtonText("恢复默认").onClick(async () => {
        this.plugin.settings.technicalTagCanonicalList = DEFAULT_TECHNICAL_TAG_CANONICAL_LIST;
        await this.plugin.saveAllData();
        this.display();
      }));

    new Setting(containerEl)
      .setName("整理已有 Tag 大小写冲突")
      .setDesc("扫描白名单目录中 frontmatter tags 的历史大小写冲突，先预览再统一。只改大小写不同的同名 Tag，不调用 AI；行内 #tag 不会被批量改写。")
      .addButton((button) => button.setButtonText("预览并整理").onClick(() => {
        new TagCaseCleanupModal(this.app, this.plugin).open();
      }));

    containerEl.createEl("h3", { text: "界面状态" });
    new Setting(containerEl)
      .setName("显示 AI 状态")
      .setDesc("在 Obsidian 底部状态栏显示当前 双摘要/Tags/Technical Depth 请求、请求间隔等待倒计时、写入阶段和下一次自动检查倒计时。")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.statusBarEnabled !== false).onChange(async (value) => {
        this.plugin.settings.statusBarEnabled = value;
        await this.plugin.saveAllData();
        this.plugin.refreshStatusBar();
      }));

    containerEl.createEl("h3", { text: "扫描与识别" });
    new Setting(containerEl)
      .setName("元数据 status 校验")
      .setDesc("关闭：批量识别白名单中的全部 Markdown。开启：自动扫描、文件夹树统计和文件夹识别只处理 frontmatter 中 status: done 的文章；status: undone、缺少 status 或其他值都跳过。文章内单篇 ✨ 手动生成不受此规则限制。")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.statusDoneOnlyEnabled === true).onChange(async (value) => {
        this.plugin.settings.statusDoneOnlyEnabled = value;
        await this.plugin.saveAllData();
        new Notice(`xyblue135 私人·AI 元数据：批量识别范围已切换为${value ? "仅 status: done" : "全部文章"}`);
        this.display();
      }));

    new Setting(containerEl)
      .setName("自动触发更新")
      .setDesc("默认关闭。开启后按设定频率扫描 /00_docs；关闭会清除下一次定时任务。若自动扫描正在等待 API，也会立即中止该自动任务；手动识别/同步不受影响。")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.autoUpdateEnabled).onChange(async (value) => {
        await this.plugin.setAutoUpdateEnabled(value);
        this.display();
      }))
      .addButton((button) => {
        const enabled = this.plugin.settings.autoUpdateEnabled === true;
        button
          .setButtonText(enabled ? "关闭自动更新" : "自动更新已关闭")
          .setDisabled(!enabled)
          .onClick(async () => {
            await this.plugin.setAutoUpdateEnabled(false, { showNotice: true });
            this.display();
          });
      });

    new Setting(containerEl)
      .setName("自动更新频率（分钟）")
      .setDesc("默认 60 分钟。最低 5 分钟。下一轮倒计时只会在本轮全部请求与写入完成后开始；插件启动后不会立即批量请求。")
      .addText((text) => {
        text.inputEl.type = "number";
        text.setValue(String(this.plugin.settings.autoUpdateMinutes)).onChange(async (value) => {
          const next = Number.parseInt(value, 10);
          if (Number.isFinite(next) && next >= 5 && next <= 10080) {
            this.plugin.settings.autoUpdateMinutes = next;
            await this.plugin.saveAllData();
            this.plugin.restartAutoScheduler();
          }
        });
      });

    new Setting(containerEl)
      .setName("待更新笔记 / 文件夹识别")
      .setDesc("打开 Obsidian 式可展开目录树：逐层展开 00_docs 子文件夹，在目标文件夹右侧直接点击“识别”，并查看具体 Markdown、缺失字段和正文预览。识别会包含该文件夹的子文件夹。")
      .addButton((button) => button.setCta().setButtonText("打开文件夹树").onClick(() => {
        this.plugin.openPendingNotesDashboard();
      }));

    const provenance = containerEl.createEl("details", { cls: "ai-metadata-settings-details" });
    provenance.createEl("summary", { text: "更新来源识别规则" });
    provenance.createEl("div", {
      cls: "setting-item-description",
      text: "默认关闭内容指纹识别：summary_short/summary_long/tags/technical_depth 只要已有有效内容就视为完成，不再因为正文变化自动判为过期；此模式不会在数据库保存 hash 指纹。开启 fingerprint 后，插件才会持久化去除 summary/summary_short/summary_long/tags/technical_depth/position 后的源指纹，并用它识别正文变化。插件自身写入仍记录为 ai-plugin。",
    });

    containerEl.createEl("h3", { text: "高级输出约束" });
    new Setting(containerEl)
      .setName("短摘要语义约束（Summary Short Harness）")
      .setDesc("控制 summary_short 的语义与写作风格。支持 {{summaryShortMaxChars}}。")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.summaryShortHarnessEnabled !== false).onChange(async (value) => {
        this.plugin.settings.summaryShortHarnessEnabled = value;
        await this.plugin.saveAllData();
      }));

    new Setting(containerEl)
      .setName("短摘要语义约束内容")
      .addTextArea((area) => {
        area.inputEl.rows = 8;
        area.inputEl.addClass("ai-metadata-harness-textarea");
        area.setValue(this.plugin.settings.summaryShortHarness).onChange(async (value) => {
          this.plugin.settings.summaryShortHarness = value;
          await this.plugin.saveAllData();
        });
      })
      .addButton((button) => button.setButtonText("恢复默认").onClick(async () => {
        this.plugin.settings.summaryShortHarness = DEFAULT_SUMMARY_SHORT_HARNESS;
        await this.plugin.saveAllData();
        this.display();
      }));

    new Setting(containerEl)
      .setName("长摘要语义约束（Summary Long Harness）")
      .setDesc("控制 summary_long 的文章结构概览。支持 {{summaryLongMaxChars}}；默认强调背景→排查/依据→判断→方案→风险/限制。")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.summaryLongHarnessEnabled !== false).onChange(async (value) => {
        this.plugin.settings.summaryLongHarnessEnabled = value;
        await this.plugin.saveAllData();
      }));

    new Setting(containerEl)
      .setName("长摘要语义约束内容")
      .addTextArea((area) => {
        area.inputEl.rows = 13;
        area.inputEl.addClass("ai-metadata-harness-textarea");
        area.setValue(this.plugin.settings.summaryLongHarness).onChange(async (value) => {
          this.plugin.settings.summaryLongHarness = value;
          await this.plugin.saveAllData();
        });
      })
      .addButton((button) => button.setButtonText("恢复默认").onClick(async () => {
        this.plugin.settings.summaryLongHarness = DEFAULT_SUMMARY_LONG_HARNESS;
        await this.plugin.saveAllData();
        this.display();
      }));

    new Setting(containerEl)
      .setName("标签值安全约束（固定）")
      .setDesc("始终生效，不能关闭：限制标签字符，并要求 B+树/C++/.NET 等技术名词改写为合法别名。本地 validator 还会在写入前再次硬过滤。")
      .addButton((button) => button.setButtonText("查看规则").onClick(() => {
        new Notice(TAG_VALUE_SAFETY_PROTOCOL, 10000);
      }));

    new Setting(containerEl)
      .setName("标签语义约束（Tags Harness）")
      .setDesc("这里控制可编辑的标签语义约束。关闭后固定的 Tag Value Safety Harness、weighted JSON 协议和本地合法性 validator 仍然生效。支持 {{maxTags}}。")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.tagsHarnessEnabled).onChange(async (value) => {
        this.plugin.settings.tagsHarnessEnabled = value;
        await this.plugin.saveAllData();
      }));

    new Setting(containerEl)
      .setName("标签语义约束内容")
      .addTextArea((area) => {
        area.inputEl.rows = 9;
        area.inputEl.addClass("ai-metadata-harness-textarea");
        area.setValue(this.plugin.settings.tagsHarness).onChange(async (value) => {
          this.plugin.settings.tagsHarness = value;
          await this.plugin.saveAllData();
        });
      })
      .addButton((button) => button.setButtonText("恢复默认").onClick(async () => {
        this.plugin.settings.tagsHarness = DEFAULT_TAGS_HARNESS;
        await this.plugin.saveAllData();
        this.display();
      }));

    new Setting(containerEl)
      .setName("技术深度评分约束（Technical Depth Prompt）")
      .setDesc("默认开启。完整阅读文章全文后按 0～100 固定尺度评分；单字段和 Beta 合并请求都会校验五个维度的整数范围及分项之和。最终只写入 frontmatter 的 technical_depth 总分。支持 {{ARTICLE}} 作为全文占位符。")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.technicalDepthHarnessEnabled !== false).onChange(async (value) => {
        this.plugin.settings.technicalDepthHarnessEnabled = value;
        await this.plugin.saveAllData();
      }));

    new Setting(containerEl)
      .setName("技术深度评分 Prompt")
      .setDesc("默认即当前 5 维 technical_depth 评分标准。单独生成时 {{ARTICLE}} 会替换为完整正文；Beta 合并时复用评分规则，并将评分明细嵌入合并 JSON。")
      .addTextArea((area) => {
        area.inputEl.rows = 22;
        area.inputEl.addClass("ai-metadata-harness-textarea");
        area.setValue(this.plugin.settings.technicalDepthHarness || DEFAULT_TECHNICAL_DEPTH_HARNESS).onChange(async (value) => {
          this.plugin.settings.technicalDepthHarness = value;
          await this.plugin.saveAllData();
        });
      })
      .addButton((button) => button.setButtonText("恢复默认").onClick(async () => {
        this.plugin.settings.technicalDepthHarness = DEFAULT_TECHNICAL_DEPTH_HARNESS;
        await this.plugin.saveAllData();
        this.display();
      }));

    new Setting(containerEl)
      .setName("面试问答约束（QA Harness）")
      .setDesc("控制 qa 面试问答的命题方向与作答风格，输出 Q/A 交替纯文本。支持 {{maxQuestions}}。")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.qaHarnessEnabled !== false).onChange(async (value) => {
        this.plugin.settings.qaHarnessEnabled = value;
        await this.plugin.saveAllData();
      }));

    new Setting(containerEl)
      .setName("面试题目数量")
      .setDesc("每次生成多少道面试题，默认 5，范围 1～20。")
      .addText((text) => {
        text.inputEl.type = "number";
        text.setValue(String(this.plugin.settings.qaMaxQuestions)).onChange(async (value) => {
          const next = Number.parseInt(value, 10);
          if (Number.isFinite(next) && next >= 1 && next <= 20) {
            this.plugin.settings.qaMaxQuestions = next;
            await this.plugin.saveAllData();
          }
        });
      });

    new Setting(containerEl)
      .setName("面试问答约束内容")
      .addTextArea((area) => {
        area.inputEl.rows = 10;
        area.inputEl.addClass("ai-metadata-harness-textarea");
        area.setValue(this.plugin.settings.qaHarness || DEFAULT_QA_HARNESS).onChange(async (value) => {
          this.plugin.settings.qaHarness = value;
          await this.plugin.saveAllData();
        });
      })
      .addButton((button) => button.setButtonText("恢复默认").onClick(async () => {
        this.plugin.settings.qaHarness = DEFAULT_QA_HARNESS;
        await this.plugin.saveAllData();
        this.display();
      }));

    new Setting(containerEl)
      .setName("参考标题约束（AI Title Harness）")
      .setDesc("控制 AI_title 参考标题的选题方向与风格，输出纯文本标题列表。支持 {{maxItems}}。")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.aiTitleHarnessEnabled !== false).onChange(async (value) => {
        this.plugin.settings.aiTitleHarnessEnabled = value;
        await this.plugin.saveAllData();
      }));

    new Setting(containerEl)
      .setName("参考标题数量")
      .setDesc("每次生成多少个参考标题，默认 5，范围 1～20。以 YAML 数组写入 frontmatter 的 AI_title。")
      .addText((text) => {
        text.inputEl.type = "number";
        text.setValue(String(this.plugin.settings.aiTitleMaxItems)).onChange(async (value) => {
          const next = Number.parseInt(value, 10);
          if (Number.isFinite(next) && next >= 1 && next <= 20) {
            this.plugin.settings.aiTitleMaxItems = next;
            await this.plugin.saveAllData();
          }
        });
      });

    new Setting(containerEl)
      .setName("参考标题约束内容")
      .addTextArea((area) => {
        area.inputEl.rows = 9;
        area.inputEl.addClass("ai-metadata-harness-textarea");
        area.setValue(this.plugin.settings.aiTitleHarness || DEFAULT_AI_TITLE_HARNESS).onChange(async (value) => {
          this.plugin.settings.aiTitleHarness = value;
          await this.plugin.saveAllData();
        });
      })
      .addButton((button) => button.setButtonText("恢复默认").onClick(async () => {
        this.plugin.settings.aiTitleHarness = DEFAULT_AI_TITLE_HARNESS;
        await this.plugin.saveAllData();
        this.display();
      }));

    containerEl.createEl("h3", { text: "摘要参数" });
    new Setting(containerEl)
      .setName("短摘要最大字符数（summary_short）")
      .setDesc("默认 100。推荐 70～120，用于文章列表、搜索结果和快速预览。")
      .addText((text) => {
        text.inputEl.type = "number";
        text.setValue(String(this.plugin.settings.summaryShortMaxChars)).onChange(async (value) => {
          const next = Number.parseInt(value, 10);
          if (Number.isFinite(next) && next >= 30 && next <= 300) {
            this.plugin.settings.summaryShortMaxChars = next;
            await this.plugin.saveAllData();
          }
        });
      });

    new Setting(containerEl)
      .setName("长摘要最大字符数（summary_long）")
      .setDesc("默认 300。推荐 250～320，用于理解文章结构、AI 排序、RAG 和技术含量判断。")
      .addText((text) => {
        text.inputEl.type = "number";
        text.setValue(String(this.plugin.settings.summaryLongMaxChars)).onChange(async (value) => {
          const next = Number.parseInt(value, 10);
          if (Number.isFinite(next) && next >= 100 && next <= 1000) {
            this.plugin.settings.summaryLongMaxChars = next;
            await this.plugin.saveAllData();
          }
        });
      });

    this.decorateSettingsPanel(containerEl);
  }

  decorateSettingsPanel(containerEl) {
    if (typeof this.activeGroup !== "string") this.activeGroup = "global";

    const buckets = {};
    for (const key of this.groupOrder) buckets[key] = [];

    const headings = Array.from(containerEl.querySelectorAll(":scope > h3"));
    for (const heading of headings) {
      if (heading.parentElement !== containerEl) continue;
      const sectionNodes = [];
      let cursor = heading.nextSibling;
      while (cursor) {
        if (cursor instanceof HTMLElement && cursor.tagName === "H3") break;
        const next = cursor.nextSibling;
        if (cursor instanceof HTMLElement) sectionNodes.push(cursor);
        cursor = next;
      }
      for (const node of sectionNodes) {
        buckets[this._groupKeyForNode(node)].push(node);
      }
    }

    const nav = this._buildGroupNav(containerEl);
    const hero = containerEl.querySelector(".ai-metadata-settings-hero");
    if (hero) {
      hero.after(nav);
    } else {
      containerEl.prepend(nav);
    }

    for (const key of this.groupOrder) {
      const groupEl = containerEl.createDiv({ cls: "ai-metadata-settings-card ai-metadata-settings-group" });
      groupEl.setAttribute("data-group", key);
      groupEl.createEl("h3", { text: this.groupLabels[key] });
      for (const node of buckets[key]) groupEl.appendChild(node);
      containerEl.appendChild(groupEl);
    }

    for (const heading of headings) heading.remove();
    this._syncGroupNav(containerEl);
  }

  _groupKeyForNode(node) {
    if (node.matches("details")) {
      const summary = node.querySelector("summary");
      const text = (summary && summary.textContent || "").trim();
      if (text.startsWith("更新来源识别规则")) return "global";
      if (text.startsWith("查看本地 Tag 索引")) return "tags";
      return "global";
    }
    const nameEl = node.querySelector(".setting-item-name");
    const name = (nameEl && nameEl.textContent || "").trim();
    const map = {
      "API 基础地址（Base URL）": "global",
      "API 密钥（API Key）": "global",
      "模型（Model）": "global",
      "API 请求超时（秒）": "global",
      "API 请求间隔（秒）": "global",
      "Beta：批量合并 4 项结构化元数据请求": "global",
      "结构化 JSON 模式": "global",
      "JSON 修复分支": "global",
      "结构化输出自动重试": "global",
      "测试 API": "global",
      "内容指纹 fingerprint 识别": "global",
      "摘要输入 Markdown 清理": "global",
      "白名单目录": "global",
      "显示 AI 状态": "global",
      "元数据 status 校验": "global",
      "自动触发更新": "global",
      "自动更新频率（分钟）": "global",
      "待更新笔记 / 文件夹识别": "global",
      "标签数量（Tags）": "tags",
      "本地 Tag 索引": "tags",
      "标签大小写规范化（Tag）": "tags",
      "技术词规范表": "tags",
      "整理已有 Tag 大小写冲突": "tags",
      "标签值安全约束（固定）": "tags",
      "标签语义约束（Tags Harness）": "tags",
      "标签语义约束内容": "tags",
      "短摘要语义约束（Summary Short Harness）": "summary_short",
      "短摘要语义约束内容": "summary_short",
      "短摘要最大字符数（summary_short）": "summary_short",
      "长摘要语义约束（Summary Long Harness）": "summary_long",
      "长摘要语义约束内容": "summary_long",
      "长摘要最大字符数（summary_long）": "summary_long",
      "技术深度评分约束（Technical Depth Prompt）": "technical_depth",
      "技术深度评分 Prompt": "technical_depth",
      "参考标题约束（AI Title Harness）": "ai_title",
      "参考标题数量": "ai_title",
      "参考标题约束内容": "ai_title",
      "面试问答约束（QA Harness）": "qa",
      "面试题目数量": "qa",
      "面试问答约束内容": "qa",
    };
    return map[name] || "global";
  }

  _buildGroupNav(containerEl) {
    const nav = containerEl.createDiv({ cls: "ai-metadata-settings-nav" });
    const select = nav.createEl("select", { cls: "dropdown" });
    for (const group of this.groupOrder) {
      const option = select.createEl("option", { text: this.groupLabels[group] });
      option.value = group;
    }
    select.value = this.activeGroup;
    select.addEventListener("change", () => {
      this.activeGroup = select.value;
      this._syncGroupNav(containerEl);
    });
    const prevBtn = nav.createEl("button", { text: "上一项" });
    prevBtn.setAttribute("type", "button");
    prevBtn.addEventListener("click", () => this._stepGroup(-1, containerEl));
    const nextBtn = nav.createEl("button", { text: "下一项" });
    nextBtn.setAttribute("type", "button");
    nextBtn.addEventListener("click", () => this._stepGroup(1, containerEl));
    return nav;
  }

  _stepGroup(delta, containerEl) {
    const order = this.groupOrder;
    let index = order.indexOf(this.activeGroup);
    if (index < 0) index = 0;
    index = (index + delta + order.length) % order.length;
    this.activeGroup = order[index];
    this._syncGroupNav(containerEl);
  }

  _syncGroupNav(containerEl) {
    const select = containerEl.querySelector(".ai-metadata-settings-nav select");
    if (select) select.value = this.activeGroup;
    containerEl.querySelectorAll(".ai-metadata-settings-group").forEach((group) => {
      const active = group.getAttribute("data-group") === this.activeGroup;
      group.classList.toggle("is-active", active);
      group.classList.toggle("is-hidden", !active);
    });
  }
}

class TagCaseCleanupModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.running = false;
  }

  onOpen() {
    this.modalEl.addClass("ai-metadata-tag-cleanup-modal");
    void this.render();
  }

  onClose() {
    this.contentEl.empty();
  }

  async render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "整理已有 Tag 大小写冲突" });
    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "只扫描并修改白名单目录中的 frontmatter tags。规则与新生成 Tag 一致：同名变体按出现次数最多的现有写法统一；次数并列且技术词规范写法已经存在时，优先该写法。整个过程不调用 AI。",
    });

    const status = contentEl.createDiv({ cls: "ai-metadata-pending-loading" });
    status.setText("正在扫描 frontmatter tags…");
    let conflicts;
    try {
      conflicts = await this.plugin.getFrontmatterTagCaseConflicts();
    } catch (error) {
      status.setText(`扫描失败：${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (!contentEl.isConnected) return;
    status.remove();

    if (!conflicts.length) {
      contentEl.createDiv({ cls: "ai-metadata-pending-empty", text: "没有发现仅大小写不同的 frontmatter Tag 冲突。" });
      return;
    }

    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: `发现 ${conflicts.length} 组冲突。下面是执行前预览：`,
    });
    const list = contentEl.createDiv({ cls: "ai-metadata-tag-catalog-preview" });
    for (const group of conflicts) {
      const row = list.createDiv({ cls: "ai-metadata-result-file" });
      const variants = group.variants.map((item) => `${item.value} ×${item.count}`).join("  /  ");
      row.setText(`${variants}  →  ${group.target}`);
    }

    const actions = contentEl.createDiv({ cls: "ai-metadata-pending-toolbar" });
    const execute = actions.createEl("button", { text: `执行统一（${conflicts.length} 组）`, cls: "mod-cta" });
    const cancel = actions.createEl("button", { text: "取消" });
    cancel.addEventListener("click", () => this.close());
    execute.addEventListener("click", async () => {
      if (this.running) return;
      this.running = true;
      execute.disabled = true;
      cancel.disabled = true;
      execute.setText("正在统一…");
      const progress = contentEl.createDiv({ cls: "ai-metadata-tree-live-progress" });
      try {
        const result = await this.plugin.applyFrontmatterTagCaseConflicts(conflicts, (event) => {
          if (progress.isConnected && event.changed) progress.setText(`[${event.index}/${event.total}] ${event.filePath}`);
        });
        new Notice(`xyblue135 私人·AI 元数据：已统一 ${result.changedFiles} 篇笔记中的 ${result.changedTags} 个 Tag 大小写`);
        await this.render();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        new Notice(`xyblue135 私人·AI 元数据：Tag 整理失败：${message}`, 7000);
        if (progress.isConnected) progress.setText(`整理失败：${message}`);
        execute.disabled = false;
        cancel.disabled = false;
        execute.setText("重新执行");
      } finally {
        this.running = false;
      }
    });
  }
}

class PendingNotesDashboardModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.lastResult = null;
    this.loading = false;
    this.expandedFolders = new Set();
  }

  onOpen() {
    this.modalEl.addClass("ai-metadata-pending-modal", "ai-metadata-tree-modal");
    void this.render();
  }

  onClose() {
    this.contentEl.empty();
  }

  async render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "待更新笔记 / 文件夹识别" });
    const intro = contentEl.createEl("div", { cls: "ai-metadata-pending-intro" });
    intro.setText(this.plugin.settings.statusDoneOnlyEnabled === true
      ? "当前已启用 status 元数据校验：这里只统计并识别 frontmatter 中 status: done 的文章。undone、缺少 status 或其他状态不会进入批量队列；文章内四个 AI 字段的 ✨ 手动生成仍可使用。"
      : "当前批量范围为全部文章：像 Obsidian 文件管理器一样展开 00_docs 子文件夹。每个文件夹右侧的“识别”按钮处理该文件夹及其子文件夹中的待更新 Markdown；文章内四个 AI 字段的 ✨ 只更新对应字段。");

    const toolbar = contentEl.createDiv({ cls: "ai-metadata-pending-toolbar" });
    const expandButton = toolbar.createEl("button", { text: "展开待更新目录" });
    expandButton.addEventListener("click", () => {
      if (!this.lastData) return;
      for (const group of this.lastData.folders) {
        if (group.recursivePending > 0 || group.recursiveEmptySkipped > 0) this.expandedFolders.add(group.folder);
      }
      void this.render();
    });
    const collapseButton = toolbar.createEl("button", { text: "全部折叠" });
    collapseButton.addEventListener("click", () => {
      this.expandedFolders.clear();
      this.expandedFolders.add(this.plugin.normalizeWhitelistFolder());
      void this.render();
    });
    const refreshButton = toolbar.createEl("button", { text: "重新统计", cls: "mod-cta" });
    refreshButton.addEventListener("click", () => void this.render());

    if (this.plugin.manualFolderRun && !this.plugin.manualFolderRun.controller.signal.aborted) {
      const stopCurrentButton = toolbar.createEl("button", {
        text: "停止当前识别",
        cls: "ai-metadata-tree-stop",
        attr: { type: "button", title: `停止正在运行的目录：${this.plugin.manualFolderRun.folder}` },
      });
      stopCurrentButton.addEventListener("click", () => {
        const stopped = this.plugin.stopPendingFolderRun();
        if (stopped) {
          stopCurrentButton.disabled = true;
          stopCurrentButton.setText("正在停止…");
        }
      });
    }

    const status = contentEl.createDiv({ cls: "ai-metadata-pending-loading" });
    status.setText("正在扫描 00_docs…");

    let data;
    try {
      data = await this.plugin.getPendingDashboardData(true);
      this.lastData = data;
    } catch (error) {
      status.setText(`统计失败：${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (!this.contentEl.isConnected) return;

    const root = this.plugin.normalizeWhitelistFolder();
    if (!this.expandedFolders.size) this.expandedFolders.add(root);

    status.empty();
    status.addClass("ai-metadata-pending-summary");
    if (data.statusFilterEnabled) {
      status.createSpan({ text: `可识别 ${data.total}/${data.whitelistTotal} 篇 · ` });
      status.createSpan({ text: `仅 status: done`, cls: "ai-metadata-filter-badge" });
      status.createSpan({ text: ` · 状态过滤 ${data.statusFilteredSkipped} 篇`, cls: "is-skipped" });
      status.createSpan({ text: " · " });
    } else {
      status.createSpan({ text: `总计 ${data.total} 篇 · ` });
    }
    status.createSpan({ text: `待更新 ${data.pending} 篇`, cls: data.pending ? "is-pending" : "is-done" });
    status.createSpan({ text: ` · 已完成 ${data.done} 篇` });
    if (data.emptySkipped) status.createSpan({ text: ` · 无正文跳过 ${data.emptySkipped} 篇`, cls: "is-skipped" });

    if (this.lastResult) this.renderLastResult(contentEl, this.lastResult);

    const visibleGroups = data.folders.filter((group) => group.recursivePending > 0 || group.recursiveEmptySkipped > 0);
    if (!visibleGroups.length) {
      contentEl.createDiv({ cls: "ai-metadata-pending-empty", text: "当前没有待更新的 Markdown。" });
      return;
    }

    const byPath = new Map(visibleGroups.map((group) => [group.folder, group]));
    const childrenByParent = new Map();
    const pushChild = (parent, group) => {
      if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
      childrenByParent.get(parent).push(group);
    };
    for (const group of visibleGroups) {
      if (group.folder === root) continue;
      const slash = group.folder.lastIndexOf("/");
      const parent = slash >= 0 ? group.folder.slice(0, slash) : root;
      pushChild(byPath.has(parent) ? parent : root, group);
    }
    for (const children of childrenByParent.values()) {
      children.sort((a, b) => {
        if ((a.recursivePending > 0) !== (b.recursivePending > 0)) return a.recursivePending > 0 ? -1 : 1;
        return a.folder.localeCompare(b.folder, "zh-CN");
      });
    }

    const tree = contentEl.createDiv({ cls: "ai-metadata-folder-tree" });
    const rootGroup = byPath.get(root) || {
      folder: root,
      files: [],
      recursivePending: data.pending,
      recursiveTotal: data.total,
      recursiveEmptySkipped: data.emptySkipped || 0,
    };
    this.renderFolderNode(tree, rootGroup, childrenByParent, 0, root);
  }

  renderFolderNode(parent, group, childrenByParent, depth, root) {
    const children = childrenByParent.get(group.folder) || [];
    const directFiles = group.files.filter((item) => item.pending || item.emptyBody);
    const hasContent = children.length > 0 || directFiles.length > 0;
    const expanded = this.expandedFolders.has(group.folder);
    const node = parent.createDiv({ cls: "ai-metadata-tree-node" });
    node.dataset.folder = group.folder;

    const row = node.createDiv({ cls: "ai-metadata-tree-folder-row" });
    row.style.setProperty("--ai-tree-depth", String(depth));
    row.setAttribute("title", group.folder);

    const chevron = row.createEl("button", {
      cls: "ai-metadata-tree-chevron clickable-icon",
      attr: { type: "button", "aria-label": expanded ? "折叠文件夹" : "展开文件夹" },
    });
    setIcon(chevron, hasContent ? (expanded ? "chevron-down" : "chevron-right") : "minus");
    if (!hasContent) chevron.addClass("is-empty");

    const folderButton = row.createEl("button", { cls: "ai-metadata-tree-folder-label", attr: { type: "button" } });
    const folderIcon = folderButton.createSpan({ cls: "ai-metadata-tree-folder-icon" });
    setIcon(folderIcon, expanded ? "folder-open" : "folder");
    folderButton.createSpan({
      text: group.folder === root ? root : group.folder.slice(group.folder.lastIndexOf("/") + 1),
      cls: "ai-metadata-tree-folder-name",
    });

    const counts = row.createDiv({ cls: "ai-metadata-tree-counts" });
    if (group.recursivePending > 0) counts.createSpan({ text: `${group.recursivePending} 待更新`, cls: "is-pending" });
    else counts.createSpan({ text: "已完成", cls: "is-done" });
    counts.createSpan({ text: `${group.recursiveTotal} 篇` });
    if (group.recursiveEmptySkipped) counts.createSpan({ text: `${group.recursiveEmptySkipped} 无正文`, cls: "is-skipped" });

    if (group.folder === root) {
      const rootTag = row.createSpan({ text: "总览", cls: "ai-metadata-tree-root-tag" });
      rootTag.setAttribute("title", "根目录仅总览，避免误触发全部处理");
    } else if (group.recursivePending > 0) {
      const identifyButton = row.createEl("button", {
        text: `识别 ${group.recursivePending}`,
        cls: "ai-metadata-tree-identify mod-cta",
        attr: { type: "button", title: `识别 ${group.folder} 及其子文件夹中的 ${group.recursivePending} 篇待更新笔记` },
      });
      identifyButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.runFolderIdentification(group, identifyButton, node);
      });
    }

    const body = node.createDiv({ cls: "ai-metadata-tree-folder-body" });
    if (!expanded) body.addClass("is-collapsed");

    for (const info of directFiles) this.renderFileInfo(body, info, depth + 1);
    for (const child of children) this.renderFolderNode(body, child, childrenByParent, depth + 1, root);

    const toggle = () => {
      if (!hasContent) return;
      const next = !this.expandedFolders.has(group.folder);
      if (next) this.expandedFolders.add(group.folder);
      else this.expandedFolders.delete(group.folder);
      body.toggleClass("is-collapsed", !next);
      setIcon(chevron, next ? "chevron-down" : "chevron-right");
      setIcon(folderIcon, next ? "folder-open" : "folder");
      chevron.setAttribute("aria-label", next ? "折叠文件夹" : "展开文件夹");
    };
    chevron.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggle();
    });
    folderButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggle();
    });
  }

  renderFileInfo(parent, info, depth) {
    const row = parent.createDiv({ cls: "ai-metadata-file-row ai-metadata-tree-file-row" });
    row.style.setProperty("--ai-tree-depth", String(depth));
    const head = row.createDiv({ cls: "ai-metadata-file-head" });
    const docIcon = head.createSpan({ cls: "ai-metadata-tree-file-icon" });
    setIcon(docIcon, "file-text");
    const openButton = head.createEl("button", { cls: "ai-metadata-file-link", text: info.file.basename });
    openButton.setAttribute("title", info.file.path);
    openButton.addEventListener("click", async () => {
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(info.file);
    });
    const badges = head.createDiv({ cls: "ai-metadata-file-badges" });
    if (info.emptyBody) badges.createSpan({ text: "无正文", cls: "ai-metadata-pending-badge is-skipped" });
    else {
      if (!info.titleDone) badges.createSpan({ text: "AI Title", cls: "ai-metadata-pending-badge" });
      if (!info.summaryShortDone) badges.createSpan({ text: "Summary Short", cls: "ai-metadata-pending-badge" });
      if (!info.summaryLongDone) badges.createSpan({ text: "Summary Long", cls: "ai-metadata-pending-badge" });
      if (!info.tagsDone) badges.createSpan({ text: "Tags", cls: "ai-metadata-pending-badge" });
      if (!info.technicalDepthDone) badges.createSpan({ text: "Technical Depth", cls: "ai-metadata-pending-badge" });
    }
    row.createDiv({ cls: "ai-metadata-file-path", text: info.file.path });
    row.createDiv({ cls: "ai-metadata-file-preview", text: info.preview || "（无可预览正文）" });
    if (info.lastError) {
      row.createDiv({ cls: "ai-metadata-file-error", text: `上次错误：${info.lastError}` });
      const retryButton = row.createEl("button", { cls: "ai-metadata-inline-action", text: "重试此笔记" });
      retryButton.addEventListener("click", async () => {
        if (this.loading) return;
        this.loading = true;
        retryButton.disabled = true;
        retryButton.setText("重试中…");
        try {
          await this.plugin.retrySingleMetadataFile(info.file, true);
        } finally {
          this.loading = false;
          if (this.contentEl.isConnected) await this.render();
        }
      });
      if (info.lastRawModelOutput) {
        const raw = row.createEl("details", { cls: "ai-metadata-raw-output" });
        raw.createEl("summary", { text: "查看上次模型原始输出" });
        raw.createEl("pre", { text: info.lastRawModelOutput });
      }
    }
  }

  async runFolderIdentification(group, identifyButton, node) {
    if (this.loading) return;
    this.loading = true;
    this.expandedFolders.add(group.folder);
    identifyButton.disabled = true;
    identifyButton.setText("识别中…");

    const stopButton = identifyButton.parentElement.createEl("button", {
      text: "停止识别",
      cls: "ai-metadata-tree-stop mod-warning",
      attr: { type: "button", title: "停止当前文件夹识别：不再处理后续文件，并中止当前等待中的 API 请求" },
    });
    const liveProgress = node.createDiv({ cls: "ai-metadata-tree-live-progress" });
    stopButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const stopped = this.plugin.stopPendingFolderRun(group.folder);
      if (stopped) {
        stopButton.disabled = true;
        stopButton.setText("正在停止…");
        liveProgress.setText("正在停止当前识别任务…");
      }
    });

    const updateProgress = (event) => {
      if (!liveProgress.isConnected) return;
      if (event.phase === "start") liveProgress.setText(`准备识别 ${event.total} 篇…`);
      else if (event.phase === "processing") liveProgress.setText(`[${event.index}/${event.total}] ${event.filePath}`);
      else if (event.phase === "success") liveProgress.setText(`✓ [${event.index}/${event.total}] ${event.filePath}`);
      else if (event.phase === "error") liveProgress.setText(`✕ [${event.index}/${event.total}] ${event.filePath}`);
      else if (event.phase === "skipped") liveProgress.setText(`⚠ [${event.index}/${event.total}] ${event.filePath} — ${event.message}`);
      else if (event.phase === "stopping") liveProgress.setText("正在停止当前识别任务…");
      else if (event.phase === "cancelled") liveProgress.setText(`已停止：成功 ${event.processed}，失败 ${event.failed}，跳过 ${event.skipped || 0}，剩余 ${event.remaining}`);
      else if (event.phase === "complete") liveProgress.setText(`完成：成功 ${event.processed}，失败 ${event.failed}，跳过 ${event.skipped || 0}，剩余 ${event.remaining}`);
    };
    try {
      this.lastResult = await this.plugin.runPendingFolder(group.folder, true, updateProgress);
    } finally {
      this.loading = false;
      if (stopButton.isConnected) stopButton.remove();
      if (this.contentEl.isConnected) await this.render();
    }
  }

  renderLastResult(parent, result) {
    const box = parent.createEl("details", { cls: "ai-metadata-last-result" });
    box.open = true;
    const title = box.createEl("summary", { text: `${result.cancelled ? "最近同步（已停止）" : "最近同步"}：${result.folder}` });
    title.setAttribute("title", result.folder);
    const body = box.createDiv({ cls: "ai-metadata-last-result-body" });
    body.createDiv({ text: `${result.cancelled ? "已停止 · " : ""}成功 ${result.processedFiles.length} · 失败 ${result.failedFiles.length} · 跳过 ${result.skippedFiles.length} · 剩余 ${result.remaining}` });
    if (result.processedFiles.length) {
      const ok = body.createEl("details");
      ok.createEl("summary", { text: `成功文件（${result.processedFiles.length}）` });
      for (const path of result.processedFiles) ok.createDiv({ cls: "ai-metadata-result-file is-success", text: `✓ ${path}` });
    }
    if (result.failedFiles.length) {
      const fail = body.createEl("details");
      fail.open = true;
      fail.createEl("summary", { text: `失败文件（${result.failedFiles.length}）` });
      for (const item of result.failedFiles) {
        const row = fail.createDiv({ cls: "ai-metadata-result-file is-error" });
        row.createDiv({ text: `✕ ${item.path} — ${item.message}` });
        if (item.rawOutput) {
          const raw = row.createEl("details", { cls: "ai-metadata-raw-output" });
          raw.createEl("summary", { text: "查看模型原始输出" });
          raw.createEl("pre", { text: item.rawOutput });
        }
      }
    }
    if (result.skippedFiles.length) {
      const skipped = body.createEl("details");
      skipped.createEl("summary", { text: `跳过文件（${result.skippedFiles.length}）` });
      for (const item of result.skippedFiles) {
        const path = typeof item === "string" ? item : item.path;
        const message = typeof item === "string" ? "跳过" : item.message;
        skipped.createDiv({ cls: "ai-metadata-result-file is-skipped", text: `⚠ ${path} — ${message}` });
      }
    }
  }
}

