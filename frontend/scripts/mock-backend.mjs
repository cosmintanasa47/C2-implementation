#!/usr/bin/env node
/**
 * Stand-in for the C2 TCP server, to try the interface without the Qt application.
 * Everything it sends is invented. Usage: node scripts/mock-backend.mjs [port]   (default 5050)
 * Test login: demo / demo. Messages are written without separators, as nlohmann::json::dump() would.
 */
import net from 'node:net';
import { createJsonSplitter } from '../dist/backend-contract.js';

const port = Number(process.argv[2] || process.env.MOCK_BACKEND_PORT || 5050);
const sensors = [
  { latitude_sensor: 44.5711, longitude_sensor: 26.0850, sensor_type: 'radar' },
  { latitude_sensor: 44.4268, longitude_sensor: 26.1025, sensor_type: 'camera' },
  { latitude_sensor: 44.3622, longitude_sensor: 26.1570, sensor_type: 'rf' },
];
const drones = ['FPV', 'Shahed-136', 'DJI Mavic 3', 'Orlan-10'];
const interceptors = ['Interceptor-A1', 'Interceptor-B2', 'Interceptor-C3', 'Interceptor-D4', 'Interceptor-E5'];
const pick = list => list[Math.floor(Math.random() * list.length)];

net.createServer(socket => {
  console.log('Interfață conectată.');
  const splitter = createJsonSplitter();
  let step = 0;
  const send = message => socket.write(JSON.stringify(message));
  const threat = () => send({
    threat_type: 'UAS', ...pick(sensors), drone_type: pick(drones),
    top_interceptors: [...interceptors].sort(() => Math.random() - 0.5).slice(0, 3),
  });
  // A slow approach from the north-east towards the centre of Bucharest.
  const point = () => { step++; send({ latitude: 44.60 - step * 0.0012 + Math.sin(step / 5) * 0.002, longitude: 26.30 - step * 0.0014 }); };
  const points = setInterval(point, 1000), threats = setInterval(threat, 12000);
  setTimeout(threat, 1500);
  socket.on('data', chunk => {
    for (const message of splitter.push(chunk).messages) {
      if ('username' in message) {
        const accepted = message.username === 'demo' && message.password === 'demo';
        console.log(`Login ${accepted ? 'acceptat' : 'respins'} pentru „${message.username}”.`);
        send({ accepted });
      } else if ('launch' in message) console.log(`Comandă primită: launch=${message.launch}, interceptor_name=${message.interceptor_name}`);
      else console.log('Mesaj necunoscut ignorat.');
    }
  });
  const stop = () => { clearInterval(points); clearInterval(threats); };
  socket.on('close', () => { stop(); console.log('Interfață deconectată.'); });
  socket.on('error', stop);
}).listen(port, '127.0.0.1', () => console.log(`Server C2 simulat pe 127.0.0.1:${port} (date inventate; login demo / demo).`));
