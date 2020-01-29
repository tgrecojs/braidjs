// Tests using a virtual network

module.exports = require['virtual-network'] = (sim) => (
    {
        sync: true,
        setup () {
            for (var i = 0; i < sim.n_peers; i++) {
                // Make a peer node
                var node = require('./node.js')()

                node.pid = 'P' + (i + 1)   // Give it an ID
                node.incoming = []         // Give it an incoming message queue
                sim.peers.push(node)       // Add it to the list of peers

                // Give it an alphabet
                if (i == 0)
                    node.letters = 'abcdefghijklmnopqrstuvwxyz'
                else if (i == 1)
                    node.letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
                else node.letters = ''
                for (var ii = 0; ii < 100; ii++)
                    node.letters += String.fromCharCode(12032 + 1000*i + ii)
                node.letters_i = 0
            }
            sim.peers.forEach(p => sim.peers_dict[p.pid] = p)

            // Create pipes that connect peers
            this.pipes = {}
            var create_vpipe = (from, to) => {
                var pipes = this.pipes
                var pipe = pipes[from.pid + '-' + to.pid] = require('./pipe.js')({
                    node: from,
                    id: from.pid + '-' + to.pid,

                    // The send function
                    send (args) {
                        if (!this.connection) {
                            console.log('sim-pipe.send: starting connection cause it was null')
                            this.connected()
                        }
                        // console.log('>> ', this.id, args)
                        assert(from.pid !== to.pid)

                        args = JSON.parse(JSON.stringify(args))
                        to.incoming.push([from.pid,
                                          () => {
                                              pipes[to.pid + '-' + from.pid].recv(
                                                  JSON.parse(JSON.stringify(args)))
                                          },
                                          'msg_id:' + sim.rand().toString(36).slice(2),
                                          args.method, JSON.parse(JSON.stringify(args))])
                    },

                    // The connect function
                    connect () { this.connected() }
                })

                from.bind('my_key', pipe)
            }

            // Create pipes for all the peers
            for (var p1 = 0; p1 < sim.n_peers; p1++)
                for (var p2 = p1 + 1; p2 < sim.n_peers; p2++) {
                    let peer1 = sim.peers[p1],
                        peer2 = sim.peers[p2]
                    // Virutal Pipe for A -> B
                    create_vpipe(peer1, peer2)
                    // Virtual Pipe for B -> A
                    create_vpipe(peer2, peer1)
                }
        },
        wrapup (cb) {
            var sent_joiner = false

            // Connect all the pipes together
            for (var pipe in this.pipes) {
                this.pipes[pipe].connected()
                notes = ['connecting ' + this.pipes[pipe]]
                sim.vis.add_frame({
                    t: -1,
                    peers: sim.peers.map(x => JSON.parse(JSON.stringify(x)))
                })
            }

            // Now let all the remaining incoming messages get processed
            do {
                sim.peers.forEach(p => {
                    while (p.incoming.length > 0) {
                        notes = []

                        // Process the message.
                        p.incoming.shift()[1]()
                        // That might have added messages to another peer's queue.

                        sim.vis.add_frame({
                            peer_notes: {[p.pid]: notes},
                            peers: sim.peers.map(x => JSON.parse(JSON.stringify(x)))
                        })
                    }
                })

                var more_messages_exist = sim.peers.some(p => p.incoming.length > 0)

                // Once everything's clear, make a joiner
                if (!more_messages_exist && !sent_joiner) {
                    var i = Math.floor(sim.rand() * sim.n_peers)
                    var p = sim.peers[i]
                    
                    log('creating joiner')
                    notes = ['creating joiner']

                    // Create it!
                    p.create_joiner('my_key')
                    sent_joiner = true
                    
                    sim.vis.add_frame({
                        peer_notes: {[p.pid]: notes},
                        peers: sim.peers.map(x => JSON.parse(JSON.stringify(x)))
                    })

                    // That'll make messages exist again
                    more_messages_exist = true
                }
            } while (more_messages_exist)
            if (cb) cb()
        },
        toggle_pipe () {
            var pipe_keys = Object.keys(this.pipes),
                random_index = Math.floor(sim.rand() * pipe_keys.length),
                random_pipe = this.pipes[pipe_keys[random_index]],
                [pid, other_pid] = pipe_keys[random_index].split('-'),
                peer = sim.peers_dict[pid],
                other_pipe = this.pipes[other_pid + '-' + pid],
                other_peer = sim.peers_dict[other_pid]

            // Toggle the pipe!
            assert(!!random_pipe.connection === !!other_pipe.connection,
                   random_pipe.connection, other_pipe.connection)
            if (random_pipe.connection) {
                random_pipe.disconnected()
                other_pipe.disconnected()

                peer.incoming = peer.incoming.filter(x => x[0] !== other_pid)
                other_peer.incoming = other_peer.incoming.filter(x => x[0] !== pid)
            } else {
                random_pipe.connected()
                other_pipe.connected()
            }
        }
    }
)