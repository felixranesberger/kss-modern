import type { StyleguideConfiguration } from './index.ts'
import path from 'node:path'
import fs from 'fs-extra'

const HEX_COLOR_RE = /^#[0-9A-F]{6}$/i

function isValidHexColor(hexCode: string) {
  return HEX_COLOR_RE.test(hexCode)
}

function shadeColor(hexColor: string, percent: number) {
  let color = hexColor

  // Strip the leading # if it's there
  color = color.replace(/^\s*#|\s*$/g, '')

  // Convert 3 char codes -> 6, e.g. `E0F` -> `EE00FF`
  if (color.length === 3) {
    color = color.replace(/(.)/g, '$1$1')
  }

  // Split HEX Color
  const hexR = color.substring(0, 2)
  const hexG = color.substring(2, 4)
  const hexB = color.substring(4, 6)

  // HEX to RGB
  let r = Number.parseInt(hexR, 16)
  let g = Number.parseInt(hexG, 16)
  let b = Number.parseInt(hexB, 16)

  if (Number.isNaN(r))
    r = 0
  if (Number.isNaN(g))
    g = 0
  if (Number.isNaN(b))
    b = 0

  // Calculate the lightness
  const lightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255

  // Determine if we should lighten or darken
  const adjust = lightness > 0.4 ? -1 : 1

  // Manipulate
  const newR = Math.min(255, Math.max(0, r + adjust * ((percent * 255) / 100)))
  const newG = Math.min(255, Math.max(0, g + adjust * ((percent * 255) / 100)))
  const newB = Math.min(255, Math.max(0, b + adjust * ((percent * 255) / 100)))

  // RGB to HEX
  const newHexRColor = `${newR.toString(16)}`.padStart(2, '0')
  const newHexGColor = `${newG.toString(16)}`.padStart(2, '0')
  const newHexBColor = `${newB.toString(16)}`.padStart(2, '0')

  return `#${newHexRColor}${newHexGColor}${newHexBColor}`
}

async function createFaviconPreviewFile(outputPath: string, theme: { light: string, dark?: string }) {
  const faviconFilePath = path.resolve(outputPath, `favicon/preview.svg`)

  const doesFileExist = await fs.pathExists(faviconFilePath)
  if (doesFileExist)
    return

  const faviconContent = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
      <style>
        .fill-theme-color { fill: ${theme.light}; }
        .fill-theme-color-20 { fill: ${shadeColor(theme.light, 20)}; }
        .fill-theme-color-40 { fill: ${shadeColor(theme.light, 40)}; }
        
        ${theme.dark
          ? `
            @media (prefers-color-scheme: dark) {
              .fill-theme-color { fill: ${theme.dark}; }
              .fill-theme-color-20 { fill: ${shadeColor(theme.dark, 20)}; }
              .fill-theme-color-40 { fill: ${shadeColor(theme.dark, 40)}; }
            }
          `
          : ''}
      </style>
    
      <g fill="none" fill-rule="nonzero">
        <path class="fill-theme-color" d="M4.5 0C5.32842712 0 6 .67157287 6 1.5V13c0 1.6568542-1.34314575 3-3 3s-3-1.3431458-3-3V1.5C0 .67157287.67157287 0 1.5 0ZM3 11c-1.1045695 0-2 .8954305-2 2s.8954305 2 2 2 2-.8954305 2-2-.8954305-2-2-2Z" />
        <path class="fill-theme-color-20" d="M7.5 12.743V4.257l1.51-1.51c.28133215-.28151251.6630087-.43967977 1.061-.43967977.3979913 0 .7796678.15816726 1.061.43967977l2.121 2.121c.2815125.28133215.4396798.6630087.4396798 1.061 0 .3979913-.1581673.77966785-.4396798 1.061L7.5 12.743Z" />
        <path class="fill-theme-color-40" d="M6.364 16H14.5c.8284271 0 1.5-.6715729 1.5-1.5v-3c0-.8284271-.6715729-1.5-1.5-1.5h-2.136l-6 6Z" />
      </g>
    </svg>
  `

  await fs.outputFile(faviconFilePath, faviconContent)
}

async function createFaviconFullPageFile(outputPath: string, theme: { light: string, dark?: string }) {
  const faviconFilePath = path.resolve(outputPath, `favicon/fullpage.svg`)

  const doesFileExist = await fs.pathExists(faviconFilePath)
  if (doesFileExist)
    return

  const faviconContent = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" class="fill-icon">
      <style>
        .fill-icon {
          fill: ${theme.light};
        }
        
        ${theme.dark
          ? `
            @media (prefers-color-scheme: dark) {
              .fill-icon { fill: ${theme.dark}; }
            }
          `
          : ''}
      </style>
    
      <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
      <path fill-rule="evenodd" d="M1.38 8.28a.87.87 0 0 1 0-.566 7.003 7.003 0 0 1 13.238.006.87.87 0 0 1 0 .566A7.003 7.003 0 0 1 1.379 8.28ZM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" clip-rule="evenodd" />
    </svg>
  `

  await fs.outputFile(faviconFilePath, faviconContent)
}

export async function generateFaviconFiles(outputPath: string, theme: StyleguideConfiguration['theme']) {
  await fs.ensureDir(path.resolve(outputPath, 'favicon'))

  const hasLightDarkTheme = typeof theme === 'object' && theme.light && theme.dark
  if (hasLightDarkTheme) {
    const isValidLightColor = isValidHexColor(theme.light)
    if (!isValidLightColor) {
      throw new Error(`Invalid light theme color ${theme.light} provided. Please provide a valid hex color code.`)
    }

    const isValidDarkColor = isValidHexColor(theme.dark)
    if (!isValidDarkColor) {
      throw new Error(`Invalid dark theme color ${theme.dark} provided. Please provide a valid hex color code.`)
    }

    await Promise.all([
      createFaviconPreviewFile(outputPath, theme),
      createFaviconFullPageFile(outputPath, theme),
    ])
  }
  else {
    const color = theme as string

    const isValidThemeColor = isValidHexColor(color)
    if (!isValidThemeColor) {
      throw new Error(`Invalid theme color ${color} provided. Please provide a valid hex color code or an object with light and dark theme colors.`)
    }

    await Promise.all([
      createFaviconPreviewFile(outputPath, { light: color }),
      createFaviconFullPageFile(outputPath, { light: color }),
    ])
  }
}
