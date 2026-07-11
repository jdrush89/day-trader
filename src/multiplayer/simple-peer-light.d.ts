declare module "simple-peer-light" {
  interface Options {
    initiator?: boolean;
    trickle?: boolean;
    config?: RTCConfiguration;
  }

  interface SignalData {
    type?: string;
    sdp?: string;
    candidate?: RTCIceCandidateInit;
  }

  class Peer {
    constructor(opts?: Options);
    signal(data: SignalData): void;
    send(data: string | Uint8Array): void;
    destroy(): void;
    destroyed: boolean;
    on(event: "signal", cb: (data: SignalData) => void): void;
    on(event: "connect", cb: () => void): void;
    on(event: "data", cb: (data: Uint8Array) => void): void;
    on(event: "close", cb: () => void): void;
    on(event: "error", cb: (err: Error) => void): void;
  }

  export = Peer;
}
