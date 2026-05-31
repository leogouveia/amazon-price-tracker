export async function sendTelegramMessage(message: string): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
        console.log("Telegram não configurado. Mensagem seria:");
        console.log(message);
        return;
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: "HTML",
            disable_web_page_preview: true,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro ao enviar Telegram: ${response.status} ${errorText}`);
    }
}