
declare var MediaRecorder: any;
export namespace ThorIOClient {

    export class BinaryMessage {

        Buffer: ArrayBuffer;
        private header: Uint8Array

        static fromArrayBuffer(buffer: ArrayBuffer): Message {

            let bytes = new Uint8Array(buffer);
            let header =  bytes.slice(0,8);
            let payloadLength = ThorIOClient.Utils.arrayToLong(header);
            let start = header.byteLength + payloadLength;
            let bytesMessage =  bytes.slice(header.byteLength,start); 
            let stop = buffer.byteLength - start;
            let messageBuffer = bytes.slice(start,stop)
            let message = JSON.parse(String.fromCharCode.apply(null, new Uint16Array(bytesMessage)));
            return new Message(message.T,message.D,message.C,messageBuffer);
        }


        constructor(message: string, public arrayBuffer: ArrayBuffer) {
            this.header = new Uint8Array(ThorIOClient.Utils.longToArray(message.length));
            this.Buffer = this.joinBuffers(this.joinBuffers(
                this.header.buffer,
                ThorIOClient.Utils.stingToBuffer(message).buffer),
                arrayBuffer);
        }
        private joinBuffers(a: ArrayBuffer, b: ArrayBuffer): ArrayBuffer {
            let newBuffer = new Uint8Array(a.byteLength + b.byteLength);
            newBuffer.set(new Uint8Array(a), 0);
            newBuffer.set(new Uint8Array(b), a.byteLength);
            return newBuffer.buffer;
        }
    }

    export class Message {
        B: ArrayBuffer | Uint8Array
        T: string;
        D: any;
        C: string;
        get JSON(): any {
            return {
                T: this.T,
                D: JSON.stringify(this.D),
                C: this.C
            }
        };
        constructor(topic: string, object: any, controller: string, buffer?: ArrayBuffer | Uint8Array) {
            this.D = object;
            this.T = topic;
            this.C = controller;
            this.B = buffer;
        }
        toString() {
            return JSON.stringify(this.JSON);
        }
        static fromArrayBuffer(buffer: ArrayBuffer): Message {
            return ThorIOClient.BinaryMessage.fromArrayBuffer(buffer);
        }
    }
    export class PeerConnection {
        context: string;
        peerId: string;
    }
    export class WebRTCConnection {
        id: string;
        RTCPeer: RTCPeerConnection;
        stream: MediaStream;
        constructor(id: string, rtcPeerConnection: RTCPeerConnection) {
            this.id = id;
            this.RTCPeer = rtcPeerConnection;
            this.stream = new  MediaStream();
        }
    }

    export class Recorder {
        private recorder: any;
        private blobs: Array<any>;
        public IsRecording: boolean;
        constructor(private stream: MediaStream, private mimeType: string, private ignoreMutedMedia) {
            this.recorder = new MediaRecorder(stream,
                { mimeType: mimeType, ignoreMutedMedia: ignoreMutedMedia }
            );
            this.recorder.onstop = (event) => {
                this.handleStop(event);
            }
            this.recorder.ondataavailable = (event) => {
                this.handleDataAvailable(event)
            };
        }

        private handleStop(event: any) {
            this.IsRecording = false;
            let blob = new Blob(this.blobs, { type: this.mimeType });
            this.OnRecordComplated.apply(event, [blob, URL.createObjectURL(blob)]);
        }

        public OnRecordComplated(blob: any, blobUrl: string) { }

        private handleDataAvailable(event: any) {
            if (event.data.size > 0) {
                this.blobs.push(event.data);

            }
        }

        IsTypeSupported(type: string) {
            throw "not yet implemented";
        }
        GetStats(): any {
            return {
                videoBitsPerSecond: this.recorder.videoBitsPerSecond,
                audioBitsPerSecond: this.recorder.audioBitsPerSecond
            }
        }
        Stop() {
            this.recorder.stop();
        }
        Start(ms: number) {
            this.blobs = new Array<any>();
            if (this.IsRecording) {
                this.Stop();
                return;
            }
            this.blobs.length = 0;
            this.IsRecording = true;

            this.recorder.start(ms || 100);
        }
    }

    export class PeerChannel {
    
        dataChannel: RTCDataChannel
        peerId: string;
        label: string;
        constructor(peerId, dataChannel, label) {
            this.peerId = peerId;
            this.dataChannel = dataChannel;
            this.label = label; // name
        }

    }

    export class DataChannel {
        private listeners: Array<Listener>;

        public Name: string;
        public PeerChannels: Array<PeerChannel>;

        constructor(name: string, listeners?: Array<Listener>) {
            this.listeners = listeners || new Array<Listener>();
            this.PeerChannels = new Array<PeerChannel>();
            this.Name = name;
        }
        On(topic: string, fn: any): Listener {
            var listener = new ThorIOClient.Listener(topic, fn);
            this.listeners.push(listener);
            return listener;
        };
        OnOpen(event: Event, peerId: string) { };
        OnClose(event: Event, peerId: string) { }
        OnMessage(event: MessageEvent) {
            var msg = JSON.parse(event.data)
            var listener = this.findListener(msg.T);
            if (listener)
                listener.fn.apply(this, [JSON.parse(msg.D)]);
        }
        Close() {
            this.PeerChannels.forEach((pc: PeerChannel) => {
                pc.dataChannel.close();
            });
        }
        private findListener(topic: string): Listener {
            let listener = this.listeners.filter(
                (pre: Listener) => {
                    return pre.topic === topic;
                }
            );
            return listener[0];
        }
        Off(topic: string) {
            let index =
                this.listeners.indexOf(this.findListener(topic));
            if (index >= 0) this.listeners.splice(index, 1);
        };
        Invoke(topic: string, data: any, controller?: string): ThorIOClient.DataChannel {
            this.PeerChannels.forEach((channel: PeerChannel) => {
                if (channel.dataChannel.readyState === "open") {
                    channel.dataChannel.send(new ThorIOClient.Message(topic, data, this.Name).toString())
                }
            });
            return this;
        }
        AddPeerChannel(pc: PeerChannel) {
            this.PeerChannels.push(pc);
        }

        RemovePeerChannel(id, dataChannel) {
            let match = this.PeerChannels.filter((p: PeerChannel) => {
                return p.peerId === id;
            })[0];
            let index = this.PeerChannels.indexOf(match);
            if (index > -1) this.PeerChannels.splice(index, 1);
        }
    }

    export class BandwidthConstraints{
        constructor(public videobandwidth:number,public audiobandwidth:number){
        }
    }

    export class WebRTC {

        public Peers: Array<WebRTCConnection>;
        public Peer: RTCPeerConnection;
        public DataChannels: Array<DataChannel>;
        public LocalPeerId: string;
        public Context: string;
        public LocalStreams: Array<any>;
        public Errors: Array<any>;
        public bandwidthConstraints: BandwidthConstraints

        constructor(private brokerProxy: ThorIOClient.Proxy, private rtcConfig: any) {
            this.Errors = new Array<any>();
            this.DataChannels = new Array<DataChannel>();
            this.Peers = new Array<any>();
            this.LocalStreams = new Array<any>();
            this.signalHandlers();

            brokerProxy.On("contextCreated", (peer: PeerConnection) => {
                this.LocalPeerId = peer.peerId;
                this.Context = peer.context;
                this.OnContextCreated(peer);
            });
            brokerProxy.On("contextChanged", (context: string) => {
                this.Context = context;
                this.OnContextChanged(context);
            });

            brokerProxy.On("connectTo", (peers: Array<PeerConnection>) => {
                this.OnConnectTo(peers);
            });
        }

        setBandwithConstraints(videobandwidth:number,audiobandwidth:number){
              this.bandwidthConstraints = new BandwidthConstraints(videobandwidth,audiobandwidth);
        }

        private setMediaBitrates(sdp:string):string {
            return this.setMediaBitrate(this.setMediaBitrate(sdp, "video", this.bandwidthConstraints.videobandwidth),
                 "audio", this.bandwidthConstraints.audiobandwidth);
        }

        private setMediaBitrate(sdp: string, media: string, bitrate: number):string {
          
            let lines = sdp.split("\n");
            let line = -1;
            for (var i = 0; i < lines.length; i++) {
                if (lines[i].indexOf("m=" + media) === 0) {
                    line = i;
                    break;
                }
            }
            if (line === -1) {

                return sdp;
            }
            line++;


            while (lines[line].indexOf("i=") === 0 || lines[line].indexOf("c=") === 0) {
                line++;
            }


            if (lines[line].indexOf("b") === 0) {
                lines[line] = "b=AS:" + bitrate;
                return lines.join("\n");
            }
            var newLines = lines.slice(0, line)
            newLines.push("b=AS:" + bitrate)
            newLines = newLines.concat(lines.slice(line, lines.length))
            return newLines.join("\n")
        }


        CreateDataChannel(name: string): ThorIOClient.DataChannel {
            let channel = new DataChannel(name);

            this.DataChannels.push(channel);

            return channel;
        }
        RemoveDataChannel(name: string) {
            var match = this.DataChannels.filter(
                (p: DataChannel) => { return p.Name === name }
            )[0];
            this.DataChannels.splice(this.DataChannels.indexOf(match), 1);
        }
        private signalHandlers() {
            this.brokerProxy.On("contextSignal", (signal: any) => {
                let msg = JSON.parse(signal.message);
                switch (msg.type) {
                    case "offer":
                        this.onOffer(signal)
                        break;
                    case "answer":
                        this.onAnswer(signal);
                        break;
                    case "candidate":
                        this.onCandidate(signal);
                        break;
                    default:
                        // do op
                        break;
                }
            });
        }
        private addError(err: any) {
            this.OnError(err);
        }
        OnError: (err: any) => void
        OnContextCreated: (peerConnection: PeerConnection) => void
        OnContextChanged: (context: string) => void
        OnRemoteTrack: (track: MediaStreamTrack, connection: WebRTCConnection) => void;
      
        //  OnRemoteStreamlost:(streamId: string, peerId: string) => void
      
        OnLocalStream: (stream: MediaStream) => void
        
        OnContextConnected: (webRTCConnection:WebRTCConnection,rtcPeerConnection: RTCPeerConnection) => void
        OnContextDisconnected: (webRTCConnection:WebRTCConnection,rtcPeerConnection: RTCPeerConnection) => void
        OnConnectTo(peerConnections: Array<PeerConnection>) {
            this.Connect(peerConnections);
        }
        OnConnected(peerId: string) {
            this.OnContextConnected(
                this.findPeerConnection(peerId),
                this.getPeerConnection(peerId))
        }
        OnDisconnected(peerId: string) {
            let peerConnection = this.getPeerConnection(peerId);
            this.OnContextDisconnected(this.findPeerConnection(peerId),peerConnection);
            peerConnection.close();
            this.removePeerConnection(peerId);
        }

        private onCandidate(event:any) {
            let msg = JSON.parse(event.message);
            let candidate = msg.iceCandidate;
            let pc = this.getPeerConnection(event.sender);

            pc.addIceCandidate(new RTCIceCandidate(candidate)).then(() => {
            }).catch((err) => {
                this.addError(err);
            });
        }
        private onAnswer(event) {
            let pc = this.getPeerConnection(event.sender);
            pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(event.message))).then((p) => {
            }).catch((err) => {
                this.addError(err);
            });
        }
        private onOffer(event) {
            let pc = this.getPeerConnection(event.sender);
            this.LocalStreams.forEach((stream:MediaStream) => {
                stream.getTracks().forEach(function(track) {
                    pc.addTrack(track, stream);
                  });
            });
            pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(event.message)));
            pc.createAnswer({offerToReceiveAudio:true,offerToReceiveVideo:true}).then( (description:RTCSessionDescriptionInit) =>{
                pc.setLocalDescription(description).then(() => {
                    if (this.bandwidthConstraints) description.sdp = this.setMediaBitrates(description.sdp);
                   let answer = {
                    sender: this.LocalPeerId,
                    recipient: event.sender,
                    message: JSON.stringify(description)
                };
                this.brokerProxy.Invoke("contextSignal", answer)
                }).catch( (err:any ) => this.addError(err));
            }).catch( (err:any) => this.addError(err));
         

        }
        AddLocalStream(stream: any): WebRTC {
            this.LocalStreams.push(stream);
            return this;
        }
        AddIceServer(iceServer: RTCIceServer): WebRTC {
            this.rtcConfig.iceServers.push(iceServer);
            return this;
        }
        private removePeerConnection(id: string) {
            let connection = this.Peers.filter((conn: WebRTCConnection) => {
                return conn.id === id;
            })[0];
            
            let index = this.Peers.indexOf(connection);
            if (index > -1)
                this.Peers.splice(index, 1);
        }
        private createPeerConnection(id: string): RTCPeerConnection {
            let rtcPeerConnection = new RTCPeerConnection(this.rtcConfig)
            rtcPeerConnection.onsignalingstatechange = (state) => { };
            rtcPeerConnection.onicecandidate = (event: any) => {
                if (!event || !event.candidate) return;
                if (event.candidate) {
                    let msg = {
                        sender: this.LocalPeerId,
                        recipient: id,
                        message: JSON.stringify({
                            type: 'candidate',
                            iceCandidate: event.candidate
                        })
                    };
                    this.brokerProxy.Invoke("contextSignal", msg);
                }
            };
            rtcPeerConnection.oniceconnectionstatechange = (event: any) => {
                switch (event.target.iceConnectionState) {
                    case "connected":
                        this.OnConnected(id);
                        break;
                    case "disconnected":
                        this.OnDisconnected(id);
                        break;
                };
            };
            rtcPeerConnection.ontrack = (event:RTCTrackEvent) => {
                let connection = this.Peers.filter((p) => {
                    return p.id === id;
                })[0];
                connection.stream.addTrack(event.track);               
                this.OnRemoteTrack(event.track, connection)
            }
          

            this.DataChannels.forEach((dataChannel: DataChannel) => {
                let pc = new PeerChannel(id, rtcPeerConnection.createDataChannel(dataChannel.Name), dataChannel.Name);
                dataChannel.AddPeerChannel(pc);
                rtcPeerConnection.ondatachannel = (event: RTCDataChannelEvent) => {
                    let channel = event.channel;
                    channel.onopen = (event: Event) => {
                        dataChannel.OnOpen(event, id);
                    };
                    channel.onclose = (event: any) => {
                        dataChannel.RemovePeerChannel(id, event.target);
                        dataChannel.OnClose(event, id);
                    };
                    channel.onmessage = (message: MessageEvent) => {
                        dataChannel.OnMessage(message);
                    };
                }
            });
            return rtcPeerConnection;
        }

        findPeerConnection(id:string):WebRTCConnection{
            let i = this.getPeerIndex(id);
            return this.Peers[i];
        }

        getPeerIndex = function(id:string):number{
                return this.Peers.findIndex ( function (pre) { return pre.id === id });
        }

        reconnectAll():Array<PeerConnection>{
            let peers = this.Peers.map( (peer:WebRTCConnection ) => {
                let p =  new PeerConnection();
                    p.peerId  = peer.id
                    p.context = this.Context;

                return p;
            });            
            this.Peers = new  Array<WebRTCConnection>();
            this.Connect(peers);
            return peers;
        }

        private getPeerConnection(id: string): RTCPeerConnection {
            let match = this.Peers.filter((connection: WebRTCConnection) => {
                return connection.id === id;
            });
            if (match.length === 0) {
                let pc = new WebRTCConnection(id, this.createPeerConnection(id));
                this.Peers.push(pc);
                return pc.RTCPeer;
            }
            return match[0].RTCPeer;
        }
        private createOffer(peer: PeerConnection) {
            let peerConnection = this.createPeerConnection(peer.peerId);
            this.LocalStreams.forEach((stream) => {
                //peerConnection.addStream(stream);
                stream.getTracks().forEach(function(track) {
                    peerConnection.addTrack(track, stream);
                  });
                this.OnLocalStream(stream);
            });


            peerConnection.createOffer({offerToReceiveAudio:true,offerToReceiveVideo:true}).then( (description: RTCSessionDescriptionInit) => {
                peerConnection.setLocalDescription(description).then( () => {
                    if(this.bandwidthConstraints) description.sdp = this.setMediaBitrates(description.sdp);
                    let offer = {
                         sender: this.LocalPeerId,
                         recipient: peer.peerId,
                         message: JSON.stringify(description)
                     };
 
                     this.brokerProxy.Invoke("contextSignal", offer);

                }).catch( (err:any) => {
                    this.addError(err);
                });
            }).catch( (err:any) => {
                this.addError(err);
            });

            return peerConnection;
        }
        Disconnect() {
            this.Peers.forEach((connection: WebRTCConnection) => {
                connection.RTCPeer.close();
            });
            this.ChangeContext(Math.random().toString(36).substring(2));
        }
        DisconnectPeer(id:string):void{
                let peer = this.findPeerConnection(id);
                peer.RTCPeer.close();
        }
        Connect(peerConnections: Array<PeerConnection>): WebRTC {
            peerConnections.forEach((peerConnection: PeerConnection) => {
                let pc = new WebRTCConnection(peerConnection.peerId, this.createOffer(peerConnection));
                this.Peers.push(pc);
            })
            return this;
        }

        ChangeContext(context: string): WebRTC {
            this.brokerProxy.Invoke("changeContext", { context: context });
            return this;
        }

        ConnectPeers() {
            this.brokerProxy.Invoke("connectContext", {});
        }
        ConnectContext() {
            this.ConnectPeers();
        }
    }

    export class Factory {
        private ws: WebSocket;
        private toQuery(obj: any) {
            return `?${Object.keys(obj).map(key => (encodeURIComponent(key) + "=" +
                encodeURIComponent(obj[key]))).join("&")}`;
        }
        private proxys: Array<ThorIOClient.Proxy>;
        public IsConnected: boolean;
        constructor(private url: string, controllers: Array<string>, params?: any) {
            this.proxys = new Array<ThorIOClient.Proxy>();
            this.ws = new WebSocket(url + this.toQuery(params || {}));
            this.ws.binaryType = "arraybuffer";
            controllers.forEach(alias => {
                this.proxys.push(
                    new Proxy(alias, this.ws)
                );
            });
            this.ws.onmessage = event => {
                if (typeof (event.data) !== "object") {
                    let message = JSON.parse(event.data);
                    this.GetProxy(message.C).Dispatch(message.T, message.D);

                } else {
                    let message = ThorIOClient.BinaryMessage.fromArrayBuffer(event.data);
                    this.GetProxy(message.C).Dispatch(message.T, message.D, message.B)
                }

            };
            this.ws.onclose = event => {
                this.IsConnected = false;
                this.OnClose.apply(this, [event]);
            }
            this.ws.onerror = error => {
                this.OnError.apply(this, [error]);
            }
            this.ws.onopen = event => {
                this.IsConnected = true;
                this.OnOpen.apply(this, this.proxys);
            };
        }
        Close() {
            this.ws.close();
        };

        GetProxy(alias: string): ThorIOClient.Proxy {
            let channel = this.proxys.filter(pre => (pre.alias === alias));
            return channel[0];
        };
        RemoveProxy(alias: string) {
            var index = this.proxys.indexOf(this.GetProxy(alias));
            this.proxys.splice(index, 1);

        }
        OnOpen(proxys: any) { };
        OnError(error: any) { }
        OnClose(event: any) { }

    }

    export class Listener {
        fn: Function;
        topic: string;
        count: number;
        constructor(topic: string, fn: Function) {
            this.fn = fn;
            this.topic = topic;
            this.count = 0;
        }
    }


    export class Utils {
        static stingToBuffer(str: string) {
            let len = str.length;
            var arr = new Array(len);
            for (let i = 0; i < len; i++) {
                arr[i] = str.charCodeAt(i) & 0xFF;
            }
            return new Uint8Array(arr);
        }

        static arrayToLong(byteArray: Uint8Array): number {
            var value = 0;
            let byteLength = byteArray.byteLength;
            for (let i = byteLength - 1; i >= 0; i--) {
                value = (value * 256) + byteArray[i];
            }
            return value;
        }

        static longToArray(long: number): Uint8Array {
            var byteArray = new Uint8Array(8)
            let byteLength = byteArray.length;
            for (let index = 0; index < byteLength; index++) {
                let byte = long & 0xff;
                byteArray[index] = byte;
                long = (long - byte) / 256;
            }
            return byteArray;
        }

        static newGuid() {
            function s4() {
                return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
            };
            return s4() + s4() + "-" + s4() + "-" + s4() + "-" + s4() + "-" + s4() + s4() + s4();
        }

    }


    export class PropertyMessage {
        name: string;
        value: any;
        messageId: string
        constructor() {
            this.messageId = ThorIOClient.Utils.newGuid();
        }
    }

    export class Proxy {
        IsConnected: boolean;
        private listeners: Array<ThorIOClient.Listener>;

        constructor(public alias: string, private ws: WebSocket) {
            this.listeners = new Array<ThorIOClient.Listener>();
            this.IsConnected = false;
            this.On("___error", (err: any) => {
                this.OnError(err)
            });
        }

        OnError(event: any) { }
        OnOpen(event: any) { }
        OnClose(event: any) { }

        Connect() {
            this.ws.send(new ThorIOClient.Message("___connect", {}, this.alias).toString());
            return this;
        };

        Close() {
            this.ws.send(new ThorIOClient.Message("___close", {}, this.alias).toString());
            return this;
        };

        Subscribe(topic: string, callback: any): Listener {

            this.ws.send(new ThorIOClient.Message("___subscribe", {
                topic: topic,
                controller: this.alias
            }, this.alias).toString());
            return this.On(topic, callback);
        };

        Unsubscribe(topic: string) {
            this.ws.send(new ThorIOClient.Message("___unsubscribe", {
                topic: topic,
                controller: this.alias
            }, this.alias).toString());

        };

        On(topic: string, fn: any): Listener {
            var listener = new ThorIOClient.Listener(topic, fn);
            this.listeners.push(listener);
            return listener;
        };

        private findListener(topic: string): Listener {
            let listener = this.listeners.filter(
                (pre: Listener) => {
                    return pre.topic === topic;
                }
            );
            return listener[0];
        }
        Off(topic: string) {
            let index =
                this.listeners.indexOf(this.findListener(topic));
            if (index >= 0) this.listeners.splice(index, 1);

        };

        InvokeBinary(buffer: ArrayBuffer): ThorIOClient.Proxy {
            if (buffer instanceof ArrayBuffer) {
                this.ws.send(buffer)
                return this;
            } else {
                throw ("parameter provided must be an ArrayBuffer constructed by Client.BinaryMessage")
            }
        }
        PublishBinary(buffer: ArrayBuffer): ThorIOClient.Proxy {
            if (buffer instanceof ArrayBuffer) {
                this.ws.send(buffer)
                return this;
            } else {
                throw ("parameter provided must be an ArrayBuffer constructed by Client.BinaryMessage")
            }
        }
        Invoke(topic: string, data: any, controller?: string): ThorIOClient.Proxy {
            this.ws.send(new ThorIOClient.Message(topic, data, controller || this.alias).toString());
            return this;
        };
        Publish(topic: string, data: any, controller?: string): ThorIOClient.Proxy {
            this.ws.send(new ThorIOClient.Message(topic, data, controller || this.alias).toString());
            return this;
        };
        SetProperty(propName: string, propValue: any, controller?: string): ThorIOClient.Proxy {
            this.Invoke(propName, propValue, controller || this.alias);
            return this;
        };
        public Dispatch(topic: string, data: any, buffer?: ArrayBuffer | Uint8Array) {
            if (topic === "___open") {
                this.IsConnected = true;
                this.OnOpen(JSON.parse(data));

                return;
            } else if (topic === "___close") {
                this.OnClose([JSON.parse(data)]);
                this.IsConnected = false;
            } else {
                let listener = this.findListener(topic);

                if (listener)
                    listener.fn(JSON.parse(data), buffer);

            }
        };
    }



}