const router = require('express').Router()
const { providerHealth } = require('../helpers/health')

router.get('/', (req, res) => res.json({ success: true, status: 'ok', uptimeSeconds: Math.round(process.uptime()) }))

// 200 when ok/degraded, 503 when the core provider (Deezer) is down: works with uptime monitors.
router.get('/providers', async (req, res) => {
  const report = await providerHealth()
  res.status(report.status === 'down' ? 503 : 200).json({ success: report.status !== 'down', ...report })
})

module.exports = router
