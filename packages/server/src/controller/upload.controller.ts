import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { extname } from 'path'

import { getMulterStorage } from '@config'
import { APP_HOMEPAGE_URL, S3_PUBLIC_URL, UPLOAD_FILE_SIZE, UPLOAD_FILE_TYPES } from '@environments'
import { helper } from '@heyform-inc/utils'

const BLOCKED_UPLOAD_EXTENSIONS = new Set(['.svg', '.svgz'])
const BLOCKED_UPLOAD_MIME_TYPES = new Set(['image/svg+xml', 'application/svg+xml'])

@Controller()
export class UploadController {
  @Post('/api/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: UPLOAD_FILE_SIZE
      },
      fileFilter: (req: any, file: any, cb: any) => {
        const extension = extname(file.originalname).toLowerCase()
        const mimeType = String(file.mimetype || '').toLowerCase()

        if (
          !BLOCKED_UPLOAD_EXTENSIONS.has(extension) &&
          !BLOCKED_UPLOAD_MIME_TYPES.has(mimeType) &&
          UPLOAD_FILE_TYPES.includes(mimeType)
        ) {
          cb(null, true)
        } else {
          cb(new BadRequestException(`Unsupported file type ${extname(file.originalname)}`), false)
        }
      },
      storage: getMulterStorage()
    })
  )
  async index(@UploadedFile() file: any): Promise<{ filename: string; url: string; size: number }> {
    let url: string =
      APP_HOMEPAGE_URL.replace(/\/+$/, '') + `/static/upload/${encodeURIComponent(file.filename)}`

    if (file.location) {
      if (helper.isValid(S3_PUBLIC_URL)) {
        url = `${S3_PUBLIC_URL.replace(/\/+$/, '')}/${file.key}`
      } else {
        url = file.location
      }
    }

    return {
      filename: file.originalname,
      size: file.size,
      url
    }
  }
}
