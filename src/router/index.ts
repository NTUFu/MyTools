import { createRouter, createWebHistory } from 'vue-router'
import Content from '../components/Content.vue'
import Base64Tool from '../components/tools/base64.vue'
import JsonFormatter from '../components/tools/JsonFormatter.vue'
import HtmlPreviewer from '../components/tools/HtmlPreviewer.vue'
import MarkdownPreviewer from '../components/tools/MarkdownPreviewer.vue'
import QRCodePreviewer from '../components/tools/QRious.vue'
import JwtDecoder from '../components/tools/JwtDecoder.vue'
import XsltDiff from '../components/tools/XsltDiff.vue'
import SqlCompare from '../components/tools/SqlCompare.vue'
import CsvXlsxToJson from '../components/tools/CsvXlsxToJson.vue'
import PlannerGantt from '../components/tools/PlannerGantt.vue'
import HashGenerator from '../components/tools/HashGenerator.vue'
import TextDiff from '../components/tools/TextDiff.vue'
import UrlToolkit from '../components/tools/UrlToolkit.vue'
import RegexTester from '../components/tools/RegexTester.vue'
import HistoryPage from '../components/History.vue'

const SqlPractice = () => import('../components/tools/SqlPractice.vue')

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
    { path: '/tools/sql-practice', component: SqlPractice },
    { path: '/history', component: HistoryPage },
    { path: '/tools/MarkdownPreviewer', redirect: '/tools/markdown-previewer' },
    { path: '/tools/QRious', redirect: '/tools/qrious' },
    { path: '/tools/HashGenerator', redirect: '/tools/hash-generator' },
    { path: '/tools/TextDiff', redirect: '/tools/text-diff' },
    { path: '/tools/UrlToolkit', redirect: '/tools/url-toolkit' },
    { path: '/tools/RegexTester', redirect: '/tools/regex-tester' },
  ],
})

export default router
