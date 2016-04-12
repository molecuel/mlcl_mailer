declare module "nodemailer-dkim" {

  export interface dkimOptions {
    domainName?: string;
    keySelector?: string;
    privateKey?: string;
  }
	/**
	 * Create a direct transporter
	 */
  export function signer(options: dkimOptions): nodemailer.Transport;
}
