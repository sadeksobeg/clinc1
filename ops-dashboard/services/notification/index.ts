export { sendViaBridge, type SendViaBridgeOptions } from "@/lib/bridgeSend";
export { getDefaultMessagingAdapter, setMessagingAdapterForTests } from "@/lib/messaging/WhatsAppWebAdapter";
export type { MessagingPort, MessagingSendInput } from "@/lib/messaging/MessagingPort";
export { enqueueCoreOutbox } from "@/lib/outbox/coreOutbox";
