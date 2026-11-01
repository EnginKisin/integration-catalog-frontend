import type { IntegrationRecord } from '../types/integration'
import { FLOW_WIDTH, flowHeight, flowMapSvg, flowReportHeight, flowComponents } from './flowMap.ts'

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30000)
}

export async function exportFlowMap(records: IntegrationRecord[], summary: string, format: 'svg' | 'png') {
  const now = new Date()
  const report = { summary, date: now.toLocaleString('tr-TR') }
  const name = `akis-haritasi-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const svg = new Blob([flowMapSvg(records, { report })], { type: 'image/svg+xml;charset=utf-8' })
  if (format === 'svg') { download(svg, `${name}.svg`); return }
  const height = flowHeight(records) + flowReportHeight(summary)
  // Keep rasterization within reliable browser canvas limits; SVG has no such limit.
  if (height * 2 > 16000 || FLOW_WIDTH * height * 4 > 32000000) throw new Error('Bu çizim PNG için çok büyük. SVG olarak indirin veya filtrelerle akış sayısını azaltın.')
  const url = URL.createObjectURL(svg)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = FLOW_WIDTH * 2
    canvas.height = height * 2
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Görsel oluşturulamadı. SVG olarak indirmeyi deneyin.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG oluşturulamadı. SVG olarak indirmeyi deneyin.')), 'image/png'))
    download(png, `${name}.png`)
  } finally { URL.revokeObjectURL(url) }
}

export function printFlowMap(records: IntegrationRecord[], summary: string) {
  document.getElementById('flow-map-print')?.remove()
  const frame = document.createElement('iframe')
  frame.id = 'flow-map-print'
  frame.title = 'Akış haritası yazdırma belgesi'
  frame.style.cssText = 'position:fixed;width:1px;height:1px;right:0;bottom:0;border:0;opacity:0;pointer-events:none'
  const reportDocument = document.implementation.createHTMLDocument('Akış Haritası')
  reportDocument.documentElement.lang = 'tr'
  const style = reportDocument.createElement('style')
  style.textContent = '@page{size:A4 landscape;margin:10mm}body{margin:0;background:white}section{break-after:page}section:last-child{break-after:auto}svg{display:block;width:100%;height:auto;max-height:185mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}'
  reportDocument.head.append(style)
  const date = new Date().toLocaleString('tr-TR')
  const groups = flowComponents(records)
  for (const [index, group] of groups.entries()) {
    const section = reportDocument.createElement('section')
    const svg = flowMapSvg(group, { report: { summary, date, page: `${index + 1} / ${groups.length} sayfa · Toplam ${records.length} akış` } })
    section.append(reportDocument.importNode(new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement, true))
    reportDocument.body.append(section)
  }
  frame.onload = () => {
    const target = frame.contentWindow
    if (!target) { frame.remove(); return }
    target.addEventListener('afterprint', () => frame.remove(), { once: true })
    target.focus()
    target.print()
  }
  frame.srcdoc = '<!doctype html>' + reportDocument.documentElement.outerHTML
  document.body.append(frame)
}
