import { notificationHandler } from './_lib/notifications.js'
export default function handler(req, res) { return notificationHandler('email', req, res) }
