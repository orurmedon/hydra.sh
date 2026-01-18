const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const HISTORY_PATH = path.join(__dirname, '../data/history.json');

const BASH_CMDS = [
    'ls -la', 'cd /var/log', 'cat syslog', 'grep ERROR syslog', 'systemctl status nginx',
    'df -h', 'free -m', 'top -n 1', 'ps aux', 'netstat -tulnp', 'iptables -L',
    'git status', 'npm run dev', 'node index.js', 'mkdir test_dir', 'rm -rf tmp',
    'echo "Hello Hydra"', 'whoami', 'pwd', 'ssh user@remote', 'scp file.txt backup/',
    'tail -f access.log', 'vim .env', 'chmod +x script.sh', 'chown www-data:www-data web/'
];

const DOCKER_CMDS = [
    'docker ps', 'docker images', 'docker pull nginx', 'docker build -t app:latest .',
    'docker stop web_srv', 'docker start db_srv', 'docker network ls', 'docker volume ls',
    'docker inspect app_container', 'docker logs --tail 20 worker'
];

const INTERACTIVE_CMDS = [
    'docker run -it debian bash', 'docker exec -it web bash', 'podman run -i -t alpine sh'
];

const USERS = [
    'Neo', 'Trinity', 'Morpheus', 'Cypher', 'Tank', 'Dozer', 'Mouse', 'Oracle'
];

function generateMockData() {
    let history = {};
    if (fs.existsSync(HISTORY_PATH)) {
        try {
            history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
        } catch (e) { }
    }

    const mockIp = "1.2.3.4";
    history[mockIp] = {};

    const baseDate = new Date("2026-01-08T08:00:00Z"); // Start 10 days ago
    let count = 0;

    for (let day = 0; day < 11; day++) {
        const currentDate = new Date(baseDate.getTime() + day * 24 * 60 * 60 * 1000);
        const dateStr = currentDate.toISOString().split('T')[0];
        history[mockIp][dateStr] = [];

        USERS.forEach(user => {
            // 10 commands per user per day
            for (let i = 0; i < 10; i++) {
                // Random time during the day
                const entryTime = new Date(currentDate.getTime() + Math.random() * 24 * 60 * 60 * 1000);
                const typeProb = Math.random();
                let type, cmd, duration;

                if (typeProb < 0.75) {
                    type = "bash";
                    cmd = BASH_CMDS[Math.floor(Math.random() * BASH_CMDS.length)];
                    duration = Math.floor(Math.random() * 500) + 10;
                } else if (typeProb < 0.90) {
                    type = "docker";
                    cmd = DOCKER_CMDS[Math.floor(Math.random() * DOCKER_CMDS.length)];
                    duration = Math.floor(Math.random() * 5000) + 500;
                } else {
                    type = "DockerInteractive";
                    cmd = INTERACTIVE_CMDS[Math.floor(Math.random() * INTERACTIVE_CMDS.length)];
                    duration = Math.floor(Math.random() * 300000) + 30000;
                }

                history[mockIp][dateStr].push({
                    id: uuidv4(),
                    user: user,
                    cmd: cmd,
                    output: "Cyber-output for " + cmd + " for user " + user,
                    duration: duration,
                    timestamp: entryTime.toISOString(),
                    connectionName: "mocking_data",
                    executionType: type
                });
                count++;
            }
        });

        // Sort the day's entries by timestamp
        history[mockIp][dateStr].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
    console.log(`Generated ${count} entries across 10 days for 10 users in 'mocking_data'`);
}

generateMockData();
