import { z } from "zod"

export const SCHEMA_VERSION = 10

export const ImageSource = z.enum(["page", "extract", "crop", "segment", "upload"])
export type ImageSource = z.infer<typeof ImageSource>

export const RenderMethodEnum = z.enum(["vector", "page-crop", "raster"])
export type RenderMethodValue = z.infer<typeof RenderMethodEnum>

export const RenderMethod = RenderMethodEnum.nullable()
export type RenderMethod = z.infer<typeof RenderMethod>

export const PageRow = z.object({
  page_id: z.string(),
  page_number: z.number().int(),
  text: z.string(),
})
export type PageRow = z.infer<typeof PageRow>

export const ImageRow = z.object({
  image_id: z.string(),
  page_id: z.string(),
  path: z.string(),
  hash: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  source: ImageSource,
  render_method: RenderMethod,
})
export type ImageRow = z.infer<typeof ImageRow>
