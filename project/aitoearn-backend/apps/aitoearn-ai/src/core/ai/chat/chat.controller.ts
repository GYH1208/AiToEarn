import { Body, Controller, Get, Post, SetMetadata } from '@nestjs/common'
import { SSE_METADATA } from '@nestjs/common/constants'
import { ApiTags } from '@nestjs/swagger'
import { GetToken, Public, TokenInfo } from '@yikart/aitoearn-auth'
import { ApiDoc, UserType, ZodValidationPipe } from '@yikart/common'

/** 未登录调用（本地自部署）：不计费、不写用户积分 */
const LOCAL_ANONYMOUS_CHAT_USER_ID = 'local-self-hosted-anonymous'
import { ChatCompletionDto, ChatStreamProxyDto, chatStreamProxyDtoSchema, ClaudeChatProxyDto, claudeChatProxyDtoSchema } from './chat.dto'
import { ChatService } from './chat.service'
import { chatCompletionChunkVoSchema, ChatCompletionVo, ChatModelConfigVo } from './chat.vo'

@ApiTags('Me/Ai/Chat')
@Controller('ai')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  private resolveChatCaller(token: TokenInfo | undefined): { userId: string, userType: UserType } {
    if (token?.id) {
      return { userId: token.id, userType: UserType.User }
    }
    return { userId: LOCAL_ANONYMOUS_CHAT_USER_ID, userType: UserType.System }
  }

  @ApiDoc({
    summary: 'Get Chat Model Parameters',
    response: [ChatModelConfigVo],
  })
  @Public()
  @Get('/models/chat')
  async getChatModels(@GetToken() token?: TokenInfo): Promise<ChatModelConfigVo[]> {
    const response = await this.chatService.getChatModelConfig({
      userId: token?.id,
      userType: UserType.User,
    })
    return response.map((item) => {
      const { openaiBaseUrl: _b, openaiApiKey: _k, ...rest } = item as Record<string, unknown>
      return ChatModelConfigVo.create(rest as Parameters<typeof ChatModelConfigVo.create>[0])
    })
  }

  @ApiDoc({
    summary: 'AI Chat Conversation',
    body: ChatCompletionDto.schema,
    response: ChatCompletionVo,
  })
  @Public()
  @Post('/chat')
  async chat(@GetToken() token: TokenInfo | undefined, @Body() body: ChatCompletionDto): Promise<ChatCompletionVo> {
    const { userId, userType } = this.resolveChatCaller(token)
    const response = await this.chatService.userChatCompletion({
      userId,
      userType,
      ...body,
    })
    return ChatCompletionVo.create(response)
  }

  @ApiDoc({
    summary: 'AI Chat Conversation (Stream)',
    body: chatStreamProxyDtoSchema,
    response: chatCompletionChunkVoSchema,
  })
  @SetMetadata(SSE_METADATA, true)
  @Public()
  @Post('/chat/stream')
  async chatStream(
    @GetToken() token: TokenInfo | undefined,
    @Body(new ZodValidationPipe(chatStreamProxyDtoSchema)) body: ChatStreamProxyDto,
  ) {
    const { userId, userType } = this.resolveChatCaller(token)
    return await this.chatService.proxyChatStream({
      userId,
      userType,
      ...body,
    })
  }

  @ApiDoc({
    summary: 'Claude Chat Conversation (Stream)',
    body: claudeChatProxyDtoSchema,
  })
  @SetMetadata(SSE_METADATA, true)
  @Public()
  @Post('/chat/claude')
  async claudeChatStream(
    @GetToken() token: TokenInfo | undefined,
    @Body(new ZodValidationPipe(claudeChatProxyDtoSchema)) body: ClaudeChatProxyDto,
  ) {
    const { userId, userType } = this.resolveChatCaller(token)
    return await this.chatService.proxyClaudeChatStream({
      userId,
      userType,
      ...body,
    })
  }
}
