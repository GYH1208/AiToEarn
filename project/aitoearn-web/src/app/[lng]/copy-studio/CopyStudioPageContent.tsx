'use client'

import type { PlatType } from '@/app/config/platConfig'
import { Loader2, Sparkles } from 'lucide-react'
import Image from 'next/image'
import { useMemo, useState } from 'react'
import { AccountPlatInfoMap } from '@/app/config/platConfig'
import { aiChatStream } from '@/api/ai'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/lib/toast'

interface PlatformCopyResult {
  platform: string
  title: string
  description: string
  hashtags: string[]
  cta: string
}

// 去掉 Qwen 等模型在 JSON 前的 think 思考块，避免整段无法 JSON.parse
function stripModelReasoningPrefix(content: string): string {
  let s = content.trim()
  const splitRe = new RegExp('<' + 'think>\\s*', 'i')
  const parts = s.split(splitRe)
  if (parts.length > 1)
    s = parts[parts.length - 1] ?? s
  const stripRe = new RegExp('^\\s*<' + 'think>[\\s\\S]*?</' + 'think>\\s*', 'i')
  s = s.replace(stripRe, '')
  return s.trim()
}

/** 从混有说明文字的字符串里取出第一个完整 JSON 对象 */
function extractFirstJsonObject(text: string): string | null {
  const anchored = text.search(/\{\s*"results"\s*:/)
  const start = anchored !== -1 ? anchored : text.indexOf('{')
  if (start === -1)
    return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (inString && c === '\\') {
      escape = true
      continue
    }
    if (c === '"' && !escape) {
      inString = !inString
      continue
    }
    if (inString)
      continue
    if (c === '{')
      depth++
    else if (c === '}')
      depth--
    if (depth === 0)
      return text.slice(start, i + 1)
  }
  return null
}

function parseJsonFromContent(content: string): PlatformCopyResult[] {
  let body = stripModelReasoningPrefix(content)
  const fenceMatch = body.match(/```json\s*([\s\S]*?)\s*```/i) || body.match(/```\s*([\s\S]*?)\s*```/i)
  body = (fenceMatch?.[1] || body).trim()

  let parsed: { results?: unknown } | unknown[] | null = null
  try {
    parsed = JSON.parse(body) as any
  }
  catch {
    const extracted = extractFirstJsonObject(body) || extractFirstJsonObject(content)
    if (!extracted)
      return []
    try {
      parsed = JSON.parse(extracted) as any
    }
    catch {
      return []
    }
  }

  const items = Array.isArray(parsed) ? parsed : (parsed as { results?: unknown })?.results
  if (!Array.isArray(items))
    return []

  return items
    .map((item: any) => ({
      platform: String(item.platform || ''),
      title: String(item.title || ''),
      description: String(item.description || ''),
      hashtags: Array.isArray(item.hashtags) ? item.hashtags.map((h: any) => String(h)) : [],
      cta: String(item.cta || ''),
    }))
    .filter((item: PlatformCopyResult) => item.platform && item.description)
}

export function CopyStudioPageContent() {
  const [productName, setProductName] = useState('')
  const [sellingPoints, setSellingPoints] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [tone, setTone] = useState('专业、可信、带轻微种草感')
  const [extraRequirements, setExtraRequirements] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [results, setResults] = useState<PlatformCopyResult[]>([])

  const platformOptions = useMemo(
    () =>
      Array.from(AccountPlatInfoMap.entries()).map(([key, info]) => ({
        key,
        label: info.name,
        icon: info.icon,
        limits: info.commonPubParamsConfig,
      })),
    [],
  )
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatType[]>([platformOptions[0]?.key as PlatType].filter(Boolean))
  const isAllSelected = platformOptions.length > 0 && selectedPlatforms.length === platformOptions.length

  const togglePlatform = (platform: PlatType) => {
    setSelectedPlatforms((prev) => {
      if (prev.includes(platform))
        return prev.filter(p => p !== platform)
      return [...prev, platform]
    })
  }

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedPlatforms([])
      return
    }
    setSelectedPlatforms(platformOptions.map(item => item.key))
  }

  const buildPrompt = () => {
    const selectedDetails = platformOptions
      .filter(item => selectedPlatforms.includes(item.key))
      .map((item) => {
        const { titleMax, desMax, topicMax } = item.limits
        return `- ${item.label} (${item.key}): title<=${titleMax ?? 80}, description<=${desMax}, hashtags<=${topicMax}`
      })
      .join('\n')

    return `
你是一名资深社媒增长文案专家。请根据产品信息，为不同平台生成差异化推广文案。

【产品名称】
${productName}

【核心卖点】
${sellingPoints}

【目标受众】
${targetAudience || '未指定'}

【语气风格】
${tone}

【额外要求】
${extraRequirements || '无'}

【目标平台与限制】
${selectedDetails}

请只返回 JSON（不要输出任何解释），格式如下：
{
  "results": [
    {
      "platform": "tiktok",
      "title": "标题",
      "description": "正文",
      "hashtags": ["话题1", "话题2"],
      "cta": "行动号召"
    }
  ]
}
`
  }

  const handleGenerate = async () => {
    if (!productName.trim() || !sellingPoints.trim()) {
      toast.warning('请先填写产品名称和核心卖点')
      return
    }
    if (selectedPlatforms.length === 0) {
      toast.warning('请至少选择一个平台')
      return
    }

    setIsGenerating(true)
    try {
      const copyStudioModel = process.env.NEXT_PUBLIC_COPY_STUDIO_CHAT_MODEL || 'Qwen3-30B-A3B-AWQ'
      const maxOut = Number(process.env.NEXT_PUBLIC_COPY_STUDIO_MAX_TOKENS || '12000')

      const response = await aiChatStream({
        model: copyStudioModel,
        messages: [
          {
            role: 'system',
            content: '你是一个严格按 JSON 输出结果的社媒文案助手。不要输出思考过程；不要输出任何 markdown 代码块以外的说明；只输出一段合法 JSON。',
          },
          { role: 'user', content: buildPrompt() },
        ],
        temperature: 0.8,
        maxTokens: Number.isFinite(maxOut) && maxOut > 0 ? maxOut : 12000,
      })
      const data = await response.json()
      if (data?.code !== 0 || !data?.data?.content) {
        throw new Error(data?.message || '生成失败')
      }

      const parsed = parseJsonFromContent(data.data.content)
      if (parsed.length === 0) {
        throw new Error('模型返回格式异常，未解析到结果')
      }
      setResults(parsed)
      toast.success(`已生成 ${parsed.length} 组平台文案`)
    }
    catch (error: any) {
      toast.error(error?.message || '生成失败，请稍后重试')
    }
    finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            文案工坊
          </CardTitle>
          <CardDescription>
            输入一次产品信息，按不同平台生成差异化推广文案（沿用现有 AI Chat API 调用链）。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="productName">产品名称</Label>
            <Input
              id="productName"
              value={productName}
              onChange={e => setProductName(e.target.value)}
              placeholder="例如：AI 自动剪辑 SaaS 工具"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sellingPoints">核心卖点</Label>
            <Textarea
              id="sellingPoints"
              value={sellingPoints}
              onChange={e => setSellingPoints(e.target.value)}
              placeholder="例如：10 分钟生成 50 条短视频；支持多平台一键发布；支持热点模板"
              rows={4}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="targetAudience">目标受众（可选）</Label>
              <Input
                id="targetAudience"
                value={targetAudience}
                onChange={e => setTargetAudience(e.target.value)}
                placeholder="例如：跨境电商卖家 / 本地门店老板"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tone">语气风格（可选）</Label>
              <Input
                id="tone"
                value={tone}
                onChange={e => setTone(e.target.value)}
                placeholder="例如：轻松、专业、有购买驱动"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="extraRequirements">额外要求（可选）</Label>
            <Textarea
              id="extraRequirements"
              value={extraRequirements}
              onChange={e => setExtraRequirements(e.target.value)}
              placeholder="例如：避免绝对化用语；强调免费试用；禁止承诺收益"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>目标平台（可多选）</Label>
              <Button type="button" variant="outline" size="sm" onClick={handleToggleSelectAll}>
                {isAllSelected ? '取消全选' : '一键全选'}
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {platformOptions.map(item => (
                <label key={item.key} className="flex items-center gap-2 rounded-md border p-2 cursor-pointer">
                  <Checkbox
                    checked={selectedPlatforms.includes(item.key)}
                    onCheckedChange={() => togglePlatform(item.key)}
                  />
                  <Image src={item.icon} alt={item.label} width={20} height={20} className="w-5 h-5 rounded-full object-contain" />
                  <span className="text-sm">{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <Button onClick={handleGenerate} disabled={isGenerating} className="w-full md:w-auto">
            {isGenerating
              ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    生成中...
                  </>
                )
              : '生成平台文案'}
          </Button>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <div className="space-y-4">
          {results.map(item => (
            <Card key={item.platform}>
              <CardHeader>
                <CardTitle className="text-base">{item.platform}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-muted-foreground">标题</Label>
                  <p className="mt-1">{item.title || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">正文</Label>
                  <p className="mt-1 whitespace-pre-wrap">{item.description}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">话题</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.hashtags.length > 0
                      ? item.hashtags.map(tag => <Badge key={tag} variant="secondary">#{tag}</Badge>)
                      : <span className="text-sm text-muted-foreground">-</span>}
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">行动号召</Label>
                  <p className="mt-1">{item.cta || '-'}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

