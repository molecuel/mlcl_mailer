declare module "nodemailer-ses-transport" {
  function nodemailerSesTransport(options?: any): nodemailer.Transport;
  export = nodemailerSesTransport;
}
