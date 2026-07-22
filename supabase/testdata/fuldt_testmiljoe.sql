-- FULDT TESTMILJOE til gennemtest 23-07-2026.
-- Daekker hver testpunkt: bookinger i alle tilstande, fakturaer i alle
-- tilstande, vogndrift med og uden bemanding, leads, kladder, manglende timer,
-- og menuer. Alt linket korrekt.
do $$
declare
  v_casanova uuid := 'a67b0c46-de20-4054-8f67-c193514e3edc';
  v_bluepearl uuid := 'fd8704a1-65df-4be2-854d-107c819c89fc';
  v_catering uuid := 'e45d0987-fbcc-4241-ab43-6f8dd5aaecf2';
  v_svante1 uuid := 'f981367a-8f9f-45c6-9bf1-493488af20e7';
  v_peter uuid; v_maria uuid; v_jonas uuid;
  c_dtu uuid; c_novo uuid; c_viva uuid; c_nielsen uuid; c_sofie uuid; c_magasin uuid;
  b_ny1 uuid; b_ny2 uuid; b_bemand uuid; b_gammel uuid; b_lukket uuid; b_multi uuid;
  d_idag uuid; d_igaar uuid; dg date;
begin
  -- ---------- Medarbejdere til bemanding (uden login) ----------
  insert into staff(name, phone, hourly_rate, active, onboarding_status, rolle)
    values ('Peter Jensen','+45 20 10 10 10',160,true,'aktiv','medarbejder') returning id into v_peter;
  insert into staff(name, phone, hourly_rate, active, onboarding_status, rolle)
    values ('Maria Holm','+45 20 20 20 20',170,true,'aktiv','medarbejder') returning id into v_maria;
  insert into staff(name, phone, hourly_rate, active, onboarding_status, rolle)
    values ('Jonas Berg','+45 20 30 30 30',160,true,'aktiv','medarbejder') returning id into v_jonas;

  -- ---------- Kunder ----------
  insert into customers(type,name,company,email,phone,address,cvr) values
    ('virksomhed','Anne Madsen','DTU Lyngby','kontakt@dtu.dk','+45 45 25 25 25','Anker Engelunds Vej 1, 2800 Kongens Lyngby','30060946') returning id into c_dtu;
  insert into customers(type,name,company,email,phone,address,cvr) values
    ('virksomhed','Lars Poulsen','Novo Nordisk','event@novo.dk','+45 44 44 88 88','Novo Alle 1, 2880 Bagsvaerd','24256790') returning id into c_novo;
  -- Café Viva: mangler adresse — tester fakturablokering
  insert into customers(type,name,company,email,phone,cvr) values
    ('virksomhed','Rasmus Kok','Café Viva','hej@cafeviva.dk','+45 33 33 33 33','12345678') returning id into c_viva;
  insert into customers(type,name,email,phone,address) values
    ('privat','Bryllupspar Nielsen','nielsen@mail.dk','+45 26 26 26 26','Skovvej 12, 2900 Hellerup') returning id into c_nielsen;
  -- Sofie: ingen email — tester kladdeblokering
  insert into customers(type,name,phone) values
    ('privat','Sofie Uden Email','+45 28 28 28 28') returning id into c_sofie;
  insert into customers(type,name,company,email,phone,address,cvr) values
    ('virksomhed','Ida Storm','Magasin','indkoeb@magasin.dk','+45 33 11 22 33','Kongens Nytorv 13, 1095 Koebenhavn','56705910') returning id into c_magasin;

  -- ---------- Bookinger i forskellige tilstande ----------
  -- Ny, om 6 dage — skal godkendes (haster i hub)
  insert into bookings(customer_id,event_date,location,food_type,covers,status,staff_required,staff_confirmed,total_price,enhed_id)
    values (c_novo, now()+interval '6 days','food_truck','pasta',80,'ny',3,0,null,v_catering) returning id into b_ny1;
  -- Ny, i morgen — haster haardt, ingen pris
  insert into bookings(customer_id,event_date,location,food_type,covers,status,staff_required,staff_confirmed,total_price,enhed_id)
    values (c_magasin, now()+interval '1 day','food_truck','pizza',40,'ny',2,0,null,v_catering) returning id into b_ny2;
  -- Klar til bekraeftelse, om 3 dage, underbemandet — bemanding haster
  insert into bookings(customer_id,event_date,location,food_type,covers,status,staff_required,staff_confirmed,total_price,enhed_id)
    values (c_dtu, now()+interval '3 days','food_truck','thai',120,'klar_til_bekraeftelse',4,1,84200,v_catering) returning id into b_bemand;
  -- Lukket for 40 dage siden UDEN faktura — faktura_mangler haster
  insert into bookings(customer_id,event_date,location,food_type,covers,status,staff_required,staff_confirmed,total_price,vareomkostning,enhed_id)
    values (c_viva, now()-interval '40 days','food_truck','pizza',60,'lukket',2,2,45000,12000,v_catering) returning id into b_gammel;
  -- Lukket for nylig, HAR faktura senere
  insert into bookings(customer_id,event_date,location,food_type,covers,status,staff_required,staff_confirmed,total_price,vareomkostning,enhed_id)
    values (c_nielsen, now()-interval '5 days','food_truck','pasta',50,'lukket',2,2,25000,7000,v_catering) returning id into b_lukket;
  -- Multi-koncept booking, om 20 dage
  insert into bookings(customer_id,event_date,location,food_type,covers,status,staff_required,staff_confirmed,total_price,enhed_id,ekstra_koncepter)
    values (c_magasin, now()+interval '20 days','food_truck','pizza',100,'klar_til_bekraeftelse',3,3,60000,v_catering, array['blue_pearl_thai']::location_type[]) returning id into b_multi;

  -- ---------- Fakturaer i alle tilstande ----------
  -- Kladde (kan udstedes i test)
  insert into invoices(booking_id,customer_id,amount,status,vat_rate,net_amount,vat_amount)
    values (b_lukket,c_nielsen,25000,'kladde',25,20000,5000);
  -- Udstedt (kan PDF-testes + sendes)
  insert into invoices(booking_id,customer_id,amount,status,invoice_number,issued_at,vat_rate,net_amount,vat_amount)
    values (b_multi,c_magasin,60000,'udstedt','2026-0021',now(),25,48000,12000);
  -- Sendt, udstedt for 40 dage siden — forfalden (haster i hub)
  insert into invoices(booking_id,customer_id,amount,status,invoice_number,issued_at,sent_at,vat_rate,net_amount,vat_amount)
    values (b_bemand,c_dtu,84200,'sendt','2026-0018',now()-interval '40 days',now()-interval '39 days',25,67360,16840);
  -- Betalt (historik)
  insert into invoices(booking_id,customer_id,amount,status,invoice_number,issued_at,sent_at,vat_rate,net_amount,vat_amount)
    values (b_gammel,c_viva,45000,'betalt','2026-0015',now()-interval '30 days',now()-interval '29 days',25,36000,9000);

  -- ---------- Leads / henvendelser ----------
  insert into leads(navn,email,telefon,besked,kilde,status,sidste_aktivitet) values
    ('Mette Skov','mette@firma.dk','+45 22 22 22 22','Vi vil gerne have catering til 50 personer til vores sommerfest i august. Kan I?','formular','ny', now()-interval '4 days'),
    ('Peter Lind','peter@lind.dk','+45 27 27 27 27','Har I ledige datoer i september til firmaevent?','formular','ny', now()-interval '4 hours'),
    ('Sofie Uden Email',null,'+45 28 28 28 28','Ringede om pizza til 30 personer til en firmafrokost.','telefon','ny', now()-interval '5 days'),
    ('Kim Dahl','kim@dahl.dk','+45 29 29 29 29','Tak for tilbuddet, vi vender tilbage.','formular','i_dialog', now()-interval '9 days');

  -- ---------- Kladde klar til afsendelse ----------
  insert into kladder(type,customer_id,recipient_email,subject,body,status) values
    ('tilbud',c_nielsen,'nielsen@mail.dk','Tilbud på bryllupscatering',
     'Kære Bryllupspar Nielsen'||chr(10)||chr(10)||'Tak for jeres henvendelse. Her er vores tilbud på catering til jeres bryllup i august...'||chr(10)||chr(10)||'Med venlig hilsen'||chr(10)||'Casa Food','klar');

  -- ---------- Vogndrift ----------
  -- Fremtidige bemandede dage
  insert into driftsdage(enhed_id,dato,aabner,lukker,status) values
    (v_casanova, current_date+2,'12:00','21:00','planlagt') returning id into d_idag;
  insert into drift_vagter(driftsdag_id,staff_id) values (d_idag, v_peter);
  -- I DAG uden bemanding — haster
  insert into driftsdage(enhed_id,dato,aabner,lukker,status)
    values (v_bluepearl, current_date,'11:00','20:00','planlagt');
  -- I morgen uden bemanding
  insert into driftsdage(enhed_id,dato,aabner,lukker,status)
    values (v_casanova, current_date+1,'12:00','21:00','planlagt');
  -- I GAAR, afholdt, bemandet men UDEN timer — gul markering + timer_mangler
  insert into driftsdage(enhed_id,dato,aabner,lukker,status)
    values (v_bluepearl, current_date-1,'11:00','20:00','afholdt') returning id into d_igaar;
  insert into drift_vagter(driftsdag_id,staff_id) values (d_igaar, v_maria);

  -- Booking-vagter kraever en AKTIV medarbejder med login. Ingen findes endnu
  -- (svante1 aktiveres foerst i testen), saa timer-signalet kommer fra vogndrift:
  -- Maria stod paa Blue Pearl i gaar uden registrerede timer.

  -- ---------- Menuer paa vognene ----------
  insert into menu_retter(madkoncept_id,navn,beskrivelse,sortering)
  select m.id, r.navn, r.besk, r.sort from madkoncepter m,
    (values ('Margherita','San Marzano, fior di latte, basilikum',10),
            ('Diavola','Spicy salami, chili, mozzarella',20)) as r(navn,besk,sort)
  where m.slug='casanova_pizza';
  insert into menu_retter(madkoncept_id,navn,beskrivelse,sortering)
  select m.id, r.navn, r.besk, r.sort from madkoncepter m,
    (values ('Pad Thai','Rismandler, tamarind, jordnoedder',10),
            ('Groen karry','Kokosmaelk, thai-basilikum, kylling',20)) as r(navn,besk,sort)
  where m.slug='blue_pearl_thai';

  raise notice 'TESTDATA OPRETTET: 6 kunder, 6 bookinger, 4 fakturaer, 4 leads, 1 kladde, 4 driftsdage, menuer';
end $$;
