import { createRouter, createWebHistory } from 'vue-router'
import Content from '../components/Content.vue'

const Base64Tool = () => import('../components/tools/base64.vue')
const JsonFormatter = () => import('../components/tools/JsonFormatter.vue')
const HtmlPreviewer = () => import('../components/tools/HtmlPreviewer.vue')
const MarkdownPreviewer = () => import('../components/tools/MarkdownPreviewer.vue')
const QRCodePreviewer = () => import('../components/tools/QRious.vue')
const JwtDecoder = () => import('../components/tools/JwtDecoder.vue')
const XsltDiff = () => import('../components/tools/XsltDiff.vue')
const SqlCompare = () => import('../components/tools/SqlCompare.vue')
const CsvXlsxToJson = () => import('../components/tools/CsvXlsxToJson.vue')
const PlannerGantt = () => import('../components/tools/PlannerGantt.vue')
const HashGenerator = () => import('../components/tools/HashGenerator.vue')
const TextDiff = () => import('../components/tools/TextDiff.vue')
const UrlToolkit = () => import('../components/tools/UrlToolkit.vue')
const RegexTester = () => import('../components/tools/RegexTester.vue')
const JsonSchemaValidator = () => import('../components/tools/JsonSchemaValidator.vue')
const TimestampConverter = () => import('../components/tools/TimestampConverter.vue')
const UuidUlidGenerator = () => import('../components/tools/UuidUlidGenerator.vue')
const PomodoroTimer = () => import('../components/tools/PomodoroTimer.vue')
const SqlPractice = () => import('../components/tools/SqlPractice.vue')
const HistoryPage = () => import('../components/History.vue')

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: Content },
    { path: '/tools/base64', component: Base64Tool },
    { path: '/tools/json-formatter', component: JsonFormatter },
    { path: '/tools/html-previewer', component: HtmlPreviewer },
    { path: '/tools/markdown-previewer', component: MarkdownPreviewer },
    { path: '/tools/qrious', component: QRCodePreviewer },
    { path: '/tools/jwt-decoder', component: JwtDecoder },
    { path: '/tools/xslt-diff', component: XsltDiff },
    { path: '/tools/sql-compare', component: SqlCompare },
    { path: '/tools/csv-xlsx-to-json', component: CsvXlsxToJson },
    { path: '/tools/planner-gantt', component: PlannerGantt },
    { path: '/tools/hash-generator', component: HashGenerator },
    { path: '/tools/text-diff', component: TextDiff },
    { path: '/tools/url-toolkit', component: UrlToolkit },
    { path: '/tools/regex-tester', component: RegexTester },
    { path: '/tools/json-schema-validator', component: JsonSchemaValidator },
    { path: '/tools/timestamp-converter', component: TimestampConverter },
    { path: '/tools/uuid-ulid-generator', component: UuidUlidGenerator },
    { path: '/tools/pomodoro-timer', component: PomodoroTimer },
    { path: '/tools/sql-practice', component: SqlPractice },
    { path: '/history', component: HistoryPage },
    { path: '/tools/MarkdownPreviewer', redirect: '/tools/markdown-previewer' },
    { path: '/tools/QRious', redirect: '/tools/qrious' },
    { path: '/tools/HashGenerator', redirect: '/tools/hash-generator' },
    { path: '/tools/TextDiff', redirect: '/tools/text-diff' },
    { path: '/tools/UrlToolkit', redirect: '/tools/url-toolkit' },
    { path: '/tools/RegexTester', redirect: '/tools/regex-tester' },
    { path: '/tools/JsonSchemaValidator', redirect: '/tools/json-schema-validator' },
    { path: '/tools/TimestampConverter', redirect: '/tools/timestamp-converter' },
    { path: '/tools/UuidUlidGenerator', redirect: '/tools/uuid-ulid-generator' },
    { path: '/tools/PomodoroTimer', redirect: '/tools/pomodoro-timer' },
  ],
})

export default router
