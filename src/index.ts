import { app } from './app'
import { env } from './env'

app.listen(env.port)
console.log(`jusmine-clinic-api listening on http://localhost:${env.port}`)
