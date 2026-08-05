/* mesa-data.js — data del corte + META + CTX + tokens.
   FUENTE ÚNICA: la consumen mesa-de-guerra.html y mockup-informe-mercado.html.
   Para refrescar el corte o cambiar de zona: se regenera ESTE archivo, las vistas no se tocan. */
function fm(x){return (x==null)?'—':x.toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.');}
var Z={EC:'Equipetrol Centro',EN:'Eq. Norte',SI:'Sirari',VB:'V. Brígida',EO:'Eq. Oeste',A3:'Eq. 3er Anillo'};
/* totales por zona: ya no se tipean — se calculan en CTX.zonaTot desde las unidades ancladas */
/* [id,nombre,lat,lon,zona,n,m2,dias,tmin,tmax,pis,gym,cow,chu,oficina] */
var B=[
[65,"Condominio Maré",-17.76565,-63.20037,"SI",22,1952,105,87750,294000,1,1,1,1,"Forza"],
[17,"Rhodium",-17.76282,-63.19910,"SI",16,1890,12,62650,156900,1,0,0,1,"Business & Residences"],
[2,"Lofty Island",-17.77108,-63.19466,"EO",13,1648,181,62843,167240,1,1,1,1,"Rita Quiroga"],
[76,"Stone 3",-17.75872,-63.19350,"VB",13,1928,93,47100,160000,1,1,1,1,"Integra"],
[30,"Sky Eclipse",-17.77239,-63.19195,"EO",11,1750,63,66000,223391,1,1,1,1,"Alfa"],
[524,"Speranto Verdi",-17.76403,-63.20313,"SI",10,1654,71,52500,88000,1,1,1,1,"RE/MAX Union"],
[499,"Magnum Residencias",-17.76854,-63.19254,"EC",8,1644,40,133000,1040000,1,1,0,1,"Select"],
[57,"Uptown Drei",-17.77035,-63.19605,"EO",8,1732,96,58500,160000,1,1,1,1,"Signature"],
[9,"Luxe Suites",-17.76480,-63.19382,"EC",7,1698,71,56711,140000,1,1,1,1,"Empire"],
[12,"HH Once Equipetrol",-17.76405,-63.19356,"EC",7,1483,184,52600,116600,1,0,1,1,"Home"],
[15,"Sky Moon",-17.75682,-63.19735,"EN",7,2103,68,85000,227702,1,1,1,1,"Azzero"],
[248,"Portobello 5",-17.75395,-63.19236,"VB",6,1611,120,59671,98000,1,1,1,1,"Integra"],
[34,"Condado VI Plaza Italia",-17.76854,-63.19726,"EC",6,1652,78,102647,252542,1,1,0,0,"Black"],
[84,"Domus Tower",-17.77157,-63.18946,"EC",6,1701,50,55000,147495,1,1,1,1,"RE/MAX Black"],
[16,"Sky Level",-17.76821,-63.19633,"EC",5,1593,62,132750,150400,0,0,0,0,"RE/MAX Fortaleza"],
[48,"Sky Tower",-17.77131,-63.19113,"EC",5,2000,57,68000,135000,1,1,0,1,"Azzero"],
[77,"You Smart Studios",-17.75876,-63.19810,"EN",5,1929,70,51469,223000,1,1,1,1,"Invictus"],
[49,"HH Chuubi",-17.76812,-63.19463,"EC",5,1620,156,75000,160000,1,0,1,1,"Home"],
[74,"Element by Elite",-17.76442,-63.20358,"SI",5,1631,88,53650,100000,1,1,0,1,"RE/MAX Black"],
[47,"Luxe Tower",-17.77126,-63.19291,"EC",4,1536,50,81000,138000,1,1,1,1,"Rita Quiroga"],
[529,"Vertical Güemes",-17.76989,-63.19106,"EC",4,1530,26,75968,182971,1,1,1,1,"Forza"],
[326,"Portobello Green",-17.76440,-63.19170,"EC",4,1924,37,50000,98500,1,1,1,1,"Integra"],
[321,"Stone 5",-17.76474,-63.20310,"SI",4,1865,167,59270,108077,1,1,1,1,"Integra"],
[151,"Suites Los Laureles",-17.76667,-63.19778,"A3",4,1780,182,68156,72019,1,0,0,0,"RE/MAX Legacy"],
[91,"Alto Busch",-17.77005,-63.20050,"EO",4,1101,164,57565,112031,1,1,1,1,"RE/MAX Emporio"],
[61,"Edificio Klug",-17.76490,-63.19466,"EC",4,1760,71,74880,145000,1,1,1,1,"Real Estate Group"],
[1,"Condominio Las Dalias",-17.76210,-63.19915,"SI",3,2002,304,103448,188575,1,0,1,1,"Norte"],
[13,"Edificio Spazios",-17.76460,-63.19419,"EC",3,2331,124,105000,380000,1,0,0,1,"Exclusive"],
[18,"Domus Infinity",-17.76497,-63.19160,"EC",3,1700,50,84370,130000,1,1,1,1,"Forza"],
[19,"Domus Insignia",-17.76902,-63.19786,"EC",3,1570,28,56475,77000,1,1,1,1,"Alfa"],
[23,"Green Tower",-17.75995,-63.19858,"EN",3,2500,50,206000,292500,1,1,0,1,"Exclusive"],
[37,"Aqua Tower",-17.76554,-63.19509,"EC",3,2000,112,118749,133720,1,1,0,1,"Meraki"],
[38,"Breeze Tower",-17.75503,-63.19132,"VB",3,1642,117,85000,147000,1,1,1,1,"Fortaleza"],
[45,"Onix Art by Elite",-17.76617,-63.20177,"SI",3,1250,109,75000,88348,1,1,1,1,"Business & Residences"],
[54,"Uptown NUU",-17.77000,-63.19669,"EC",3,1570,103,58900,240000,1,1,0,1,"BluRealty"],
[55,"INIZIO",-17.77076,-63.19746,"EO",3,1370,151,40000,128888,1,0,0,1,"Grand Insignia"],
[57.1,"Uptown Drei (torre 2)",-17.77035,-63.19605,"EC",3,1902,64,66000,145000,1,1,1,1,"Forza"],
[64,"SÖLO Industrial Apartments",-17.76660,-63.19337,"EC",3,1539,90,68200,70459,1,0,1,1,"Home"],
[90,"Grigia Residenze",-17.76003,-63.19703,"EN",3,1892,76,55000,70000,1,1,1,1,"Black"],
[109,"Condominio Sky Luxia",-17.76542,-63.19430,"EC",3,2212,75,69000,85000,1,0,0,1,"Azzero"],
[112,"Eurodesign Le Blanc",-17.75830,-63.19692,"EN",3,2241,77,92500,130000,1,1,1,1,"Azzero"],
[135,"SKY Luxury",-17.75769,-63.19842,"EC",3,1534,35,50037,90000,1,1,1,1,"Deluxe"],
[252,"Edificio Elite Sirari",-17.76428,-63.19979,"SI",3,1447,19,51126,67000,1,0,0,1,"Élite"],
[280,"Sky Plaza Italia",-17.76959,-63.19669,"EC",3,1624,116,66000,209799,1,1,0,1,"Norte"],
[283,"Speranto Residenze",-17.76737,-63.19525,"EC",6,1540,92,54000,111332,1,1,1,1,"Platinum"],
[289,"Edificio Sirari Palm",-17.76390,-63.19929,"SI",3,1725,45,75431,95000,1,0,0,1,"Business & Residences"],
[349,"Edificio Tanaro",-17.76073,-63.19722,"EN",3,1560,91,120000,141000,0,0,0,0,"Loyalty"],
[228,"Edificio Vertical 60",-17.75699,-63.19137,"VB",2,1579,219,65000,118000,1,1,0,1,"RE/MAX Legacy"],
[7,"Sky Elite",-17.76608,-63.19660,"EC",2,2000,74,61866,73000,1,1,1,1,"Empire"],
[113,"Eurodesign Tower",-17.76648,-63.19713,"EC",2,1635,31,71485,102000,1,1,1,1,"Home"],
[332,"Trivento IV",-17.76121,-63.19695,"EN",2,1588,14,58975,75883,0,0,0,0,"Signature"],
[334,"Torre Real",-17.77095,-63.19145,"EC",2,1295,65,64500,190000,1,0,0,0,"Rita Quiroga"],
[92,"Edificio Fragata",-17.77120,-63.19172,"EC",2,1686,170,200000,218500,1,1,0,1,"Business & Residences"],
[337,"Eurodesign Suites",-17.76172,-63.20002,"SI",2,1743,70,80000,95000,1,1,0,1,"Business & Residences"],
[85,"PÖRA by Vertical Homes",-17.76495,-63.20301,"SI",2,1526,126,86000,93000,0,0,0,0,"BluRealty"],
[253,"Torre Ara",-17.77064,-63.18969,"EC",2,1745,62,79000,85000,1,0,0,1,"Atlas"],
[254,"Condominio Omnia Prime",-17.76659,-63.20314,"SI",2,1456,115,126300,130000,1,0,0,1,"Forza"],
[36,"Nano Smart",-17.76427,-63.19260,"EC",2,1937,74,52000,77443,1,0,1,1,"Blu Inversiones"],
[50,"Condominio Sky Equinox",-17.76586,-63.20497,"SI",2,1837,103,75255,82950,1,0,1,0,"Alfa"],
[294,"Condominio Azul",-17.75833,-63.19663,"EN",2,950,102,135000,139000,1,1,0,1,"Platinum"],
[25,"Platinum II",-17.75490,-63.19722,"VB",2,1550,157,163120,170000,1,1,0,1,"BluRealty"],
[275,"Eurodesign Soho",-17.76940,-63.19689,"EC",2,2369,81,130800,180000,1,1,1,1,"Norte"],
[41,"Stratto Up",-17.75859,-63.19478,"VB",3,1528,24,65250,375000,1,1,1,1,"RE/MAX Infinity"],
[162,"Condominio Stanza",-17.76800,-63.19544,"EC",2,1700,70,83046,95000,1,1,1,1,"Futuro"],
[6,"La Riviera",-17.76049,-63.20195,"SI",2,1870,84,180000,395000,1,0,0,0,"RE/MAX Fortaleza"],
[282,"Haus Equipetrol",-17.76407,-63.19223,"EC",2,1836,84,60000,120000,1,0,0,1,"Rita Quiroga"],
[525,"Grigia Deluxe",-17.76377,-63.19870,"SI",2,1822,71,97000,104000,1,0,1,1,"RE/MAX Union"],
[346,"Stone 6",-17.75469,-63.19256,"VB",2,1479,66,47000,60990,1,1,1,1,"Azzero"],
[40,"Sky Lux",-17.75586,-63.19747,"VB",2,1459,95,88500,210000,0,0,0,1,"Business & Residences"],
[226,"One Soul by Smart Studio",-17.76040,-63.19675,"EN",2,1823,34,58000,76300,1,0,1,1,"Forza"],
[169,"Condominio Du Nord X",-17.75812,-63.19753,"EN",1,2750,76,82500,82500,1,0,0,1,"Exclusive"],
[219,"Edificio Macororó 9",-17.76378,-63.19160,"EC",1,1500,116,255000,255000,1,0,0,1,"RE/MAX Fortaleza"],
[221,"Santorini Ventura",-17.75501,-63.19459,"VB",1,1250,278,70000,70000,1,0,0,1,"RE/MAX Plus"],
[222,"Condominio Sky Magnolia",-17.76360,-63.20304,"EC",1,1975,68,79000,79000,0,0,0,0,"Exclusive"],
[224,"Legendary by Elite",-17.76120,-63.19911,"SI",1,1798,73,65000,65000,1,0,0,0,"Connection"],
[21,"Condominio Cruz",-17.75367,-63.19143,"VB",1,1548,34,142212,142212,1,0,0,1,"Grand Insignia"],
[249,"Luxe Residence",-17.75831,-63.19899,"EC",1,1650,140,133650,133650,1,1,0,1,"RE/MAX Emporio"],
[250,"Edificio Macororó 5",-17.75669,-63.19758,"EN",1,1590,82,62000,62000,1,0,0,1,"Business & Residences"],
[523,"Domus Onix",-17.76655,-63.20437,"SI",1,2085,34,68820,68820,0,0,0,0,"Alfa"],
[255,"T-Veinticinco",-17.76528,-63.19218,"EC",1,1400,133,114744,114744,1,1,0,1,"RE/MAX Patrimonio"],
[256,"Terrazo",-17.76824,-63.19934,"EC",1,1751,103,87000,87000,0,1,0,0,"RE/MAX Fortaleza"],
[278,"Madero Residence",-17.76799,-63.19657,"SI",1,1961,106,200000,200000,1,0,0,1,"Premium"],
[527,"Torre Santa Elena",-17.76731,-63.19660,"EC",1,1608,28,278000,278000,0,0,0,0,"Atlas"],
[284,"Stone 2",-17.75516,-63.19168,"VB",1,1200,60,79464,79464,1,1,1,1,"Alfa"],
[285,"Condominio Sky",-17.75696,-63.19812,"EN",1,1045,118,115000,115000,1,1,0,1,"Select"],
[286,"Condominio Macororó 8",-17.77213,-63.20141,"EO",1,1307,27,150000,150000,1,0,0,1,"Blu Inversiones"],
[528,"Los Cedros",-17.75555,-63.19256,"VB",1,1557,27,140000,140000,1,1,0,0,"RE/MAX Legacy"],
[291,"Edificio Bamboo",-17.75562,-63.19601,"VB",2,1336,161,49500,71121,0,0,0,0,"Business & Residences"],
[292,"Edificio MonteBelluna",-17.75900,-63.19468,"EN",1,1588,91,135000,135000,0,0,0,1,"Azzero"],
[293,"Condominio Puerto Madero",-17.76532,-63.20288,"SI",1,1664,5,125000,125000,1,1,0,1,"RE/MAX Fortaleza"],
[301,"Bellini Suites",-17.76716,-63.19620,"EC",1,2271,98,70402,70402,0,0,0,0,"Home"],
[304,"Omnia Eco Lux",-17.76425,-63.20005,"SI",1,2386,112,179000,179000,1,0,0,1,"Integra"],
[307,"Yotau All Suites",-17.77145,-63.19144,"EC",1,1311,33,140000,140000,1,1,0,0,"Ámbar"],
[323,"Sky Onix",-17.75807,-63.19911,"EN",2,1833,91,76000,132000,0,1,0,0,"RE/MAX Emporio"],
[324,"Edificio Aura Concept",-17.76660,-63.19521,"EC",1,1500,162,108000,108000,1,1,1,1,"RE/MAX Emporio"],
[325,"+Plus Isuto",-17.75715,-63.19281,"VB",1,1670,151,110000,110000,0,0,0,1,"Signature"],
[8,"Giardino",-17.76357,-63.19746,"SI",1,2303,159,137284,137284,0,0,0,0,"RE/MAX Fortaleza"],
[330,"Edificio Omnia Suites",-17.75598,-63.19469,"VB",1,1615,115,71000,71000,1,0,0,1,"Forza"],
[336,"Eurodesign Nordic",-17.76204,-63.19681,"EN",1,2228,118,125000,125000,1,1,0,1,"Azzero"],
[339,"Phantom by Elite",-17.76293,-63.19867,"SI",1,2054,42,98600,98600,0,0,0,0,"Design District"],
[340,"Edificio Le Grand",-17.76298,-63.19985,"SI",1,1752,46,198000,198000,0,0,0,0,"Exclusive"],
[42,"Atrium",-17.76855,-63.19589,"EC",1,1652,85,156000,156000,1,0,0,1,"Business & Residences"],
[341,"Torre Suant Isuto",-17.76548,-63.19131,"EC",1,1250,103,145000,145000,1,1,0,1,"RE/MAX Emporio"],
[342,"Edificio Europeo",-17.75940,-63.19917,"EN",1,1865,146,97000,97000,1,1,0,1,"RE/MAX Fortaleza"],
[345,"Edificio Conquistador",-17.77119,-63.19439,"EO",1,947,84,160000,160000,0,0,0,0,"Black"],
[58,"Sky Collection Art Deco",-17.76894,-63.19649,"EC",1,1908,167,145000,145000,1,1,0,0,"Forza"],
[60,"Edificio Condado II",-17.76885,-63.19524,"EN",1,1484,20,118000,118000,1,0,0,1,"Rita Quiroga"],
[63,"Nomad by Smart Studio",-17.76768,-63.19573,"EC",1,1913,10,118000,118000,1,0,1,1,"Atlas"],
[69,"Condominio Casa Blanca",-17.76216,-63.19416,"A3",1,1531,98,250000,250000,1,0,0,0,"Forza"],
[67,"Malibu Inside",-17.76521,-63.19194,"EC",1,2239,228,150000,150000,1,0,1,1,"Home"],
[70,"Edificio Siria 2",-17.75560,-63.19337,"VB",1,1316,116,42103,42103,1,0,0,1,"Blu Inversiones"],
[71,"Edificio Platinum",-17.75525,-63.19744,"EN",1,1563,30,100000,100000,1,1,0,1,"RE/MAX Fortaleza"],
[27,"Macororó 7",-17.77078,-63.19426,"EO",1,1641,86,130000,130000,1,0,0,1,"Titanium"],
[80,"Aura Residences",-17.75625,-63.19327,"VB",1,889,6,95079,95079,0,0,1,1,"Business & Residences"],
[5,"Vertical Terra",-17.75942,-63.19393,"VB",1,1563,130,75000,75000,0,0,0,0,"Territorio"],
[22,"Golden Tower",-17.76156,-63.19673,"EN",2,1883,85,99500,115000,1,1,1,1,"Business & Residences"],
[95,"Condominio Avanti",-17.75858,-63.19272,"VB",1,1708,298,125000,125000,1,0,1,1,"RE/MAX Union"],
[104,"Sky Collection Equipetrol",-17.76625,-63.19567,"EC",1,1648,41,145000,145000,1,1,1,1,"Élite"],
[351,"Sky Art",-17.76088,-63.19650,"EN",1,1399,101,120296,120296,1,1,0,1,"Business & Residences"],
[120,"Baruc IV",-17.75909,-63.19238,"VB",1,1555,62,50700,50700,1,0,1,1,"Norte"],
[126,"Condominio Aguaí",-17.75669,-63.19893,"EN",1,1345,90,320000,320000,1,1,0,1,"RE/MAX Infinity"],
[129,"NanoTec by Smart Studio",-17.76061,-63.19587,"EN",2,2036,108,85000,88000,1,0,0,0,"RE/MAX Fortaleza"],
[521,"Piazza Once",-17.76883,-63.19151,"EC",1,1239,47,135000,135000,1,0,0,1,"Business & Residences"],
[139,"Equipetrol Day Suites",-17.76391,-63.19974,"SI",1,1809,54,275000,275000,0,0,0,0,"Rita Quiroga"],
[142,"Sky Design",-17.76410,-63.20249,"SI",2,1531,45,107407,209000,1,1,0,1,"Exclusive"],
[164,"Edificio Itaipú",-17.75539,-63.19582,"VB",1,1395,26,87644,87644,1,1,0,1,"Avanti"],
[167,"Edificio Itaju",-17.76113,-63.19886,"SI",1,1744,132,575000,575000,1,0,0,1,"Territorio"]
];
/* salidas de julio por id de edificio */
var SAL={42:7,524:5,80:4,113:4,1:3,30:3,76:2,109:2,25:2,48:2,54:2,15:2,71:1,77:1,84:1,95:1,112:1,221:1,283:1,286:1,523:1,6:1,9:1,12:1,18:1,19:1,22:1,55:1,57:1,63:1,64:1};
/* libro de unidades por edificio: "dorms|m2|precio|piso|dias|parqueo|estado" (BD 3-ago) */
var UN={
1:"1|52|103448|1|304|-|prev;1|52|103448|5|304|-|prev;2|75|188575|1|179|-|prev",
2:"0|43|62843|4|13|-|-;0|36|69099|-|181|1|prev;1|68|83000|-|181|1|-;1|70|85000|-|181|0|entr;1|51|91584|-|407|0|prev;1|70|97706|4|13|-|-;1|70|118600|-|407|0|prev;1|70|118770|-|181|1|prev;2|101|167000|-|407|0|prev;2|101|167239|-|181|1|prev;2|101|167240|-|181|0|prev;-|70|122000|-|407|0|prev",
3:"1|42|92931|3|120|-|prev;2|106|152520|-|120|0|prev",
5:"1|48|75000|-|130|-|-",
6:"2|100|180000|10|69|1|-;3|204|395000|13|98|1|-",
7:"0|32|73000|2|57|0|-",
8:"1|60|137284|-|159|-|prev",
9:"0|35|56711|4|76|0|-;0|35|67000|-|148|-|entr;0|38|68000|1|56|0|entr;1|62|105000|7|12|-|-;2|84|133000|-|85|0|-;2|80|135000|1|12|0|entr;2|71|140000|1|71|0|-",
12:"0|71|88300|-|184|-|prev;1|35|52600|3|129|1|entr;1|56|63000|-|184|-|prev;1|56|77300|-|307|-|prev;1|56|90000|6|8|-|entr;1|62|91500|-|184|-|prev;1|64|116600|-|184|-|prev",
13:"1|41|105000|-|85|0|entr;1|51|112500|-|124|-|-;3|163|380000|-|124|-|-",
15:"0|42|85000|5|104|-|-;1|62|135000|-|85|1|-;1|74|136621|13|40|1|entr;1|66|139000|-|151|1|-;1|74|160000|12|36|0|-;2|102|208000|-|68|1|-;2|105|227702|15|49|1|-",
16:"2|89|132750|-|165|-|prev;2|90|141000|-|62|0|prev;2|89|141000|-|165|-|prev;2|89|141600|-|62|0|prev;2|90|150400|-|62|0|prev",
17:"0|38|62650|2|12|-|prev;0|38|63400|3|12|-|prev;0|36|68650|13|12|-|prev;0|38|69950|7|12|-|prev;0|38|70800|4|12|-|prev;0|38|73100|2|12|-|prev;0|43|73950|3|12|-|prev;0|38|74850|4|12|-|prev;0|37|75050|7|12|-|prev;0|42|76750|9|12|-|prev;0|36|88250|13|141|-|prev;1|44|83500|4|12|-|prev;2|75|133650|-|12|-|prev;2|75|135250|4|12|-|prev;2|75|141450|2|12|-|prev;2|79|156900|2|12|-|prev",
18:"1|48|84370|5|19|-|entr;1|52|87890|-|50|-|entr;2|78|130000|-|92|1|entr",
19:"0|49|77000|5|28|0|-;1|38|56475|-|10|-|prev;1|38|56475|-|53|0|prev",
21:"2|92|142212|2|34|0|-",
22:"1|53|99500|15|85|1|entr;1|51|115000|-|127|-|entr",
23:"1|70|206000|-|50|1|-;2|117|292500|-|127|-|-;2|117|292500|-|35|0|-",
25:"2|108|163120|28|201|0|entr;2|107|170000|-|113|0|-",
27:"2|79|130000|1|86|1|-",
30:"0|42|66000|6|97|-|entr;0|41|73000|-|21|-|entr;0|40|74119|-|160|-|-;0|67|99750|3|238|-|-;0|61|112600|3|97|1|-;1|68|115600|6|63|0|entr;1|68|119000|14|57|0|entr;1|65|150000|8|74|1|-;2|101|165948|-|39|0|-;2|101|165948|-|35|1|-;2|105|188000|11|55|1|entr;2|106|223391|7|152|1|-",
34:"1|62|102647|3|165|-|-;1|62|102647|-|64|0|-;2|87|144573|-|78|0|-;3|144|238112|-|98|0|-;3|144|238112|-|78|0|-;3|144|252542|-|18|0|entr",
36:"0|33|52000|-|64|0|-;0|33|77443|-|83|-|-",
37:"1|56|118749|-|112|-|-;1|67|133700|-|112|-|-;1|67|133720|-|160|1|entr",
38:"1|59|85000|11|160|1|entr;1|52|99000|10|117|-|entr;2|90|147000|4|57|0|entr",
40:"1|56|88500|7|141|-|-;3|157|210000|-|49|1|-",
41:"0|44|65250|3|36|1|entr;0|40|75000|6|7|-|entr;-|241|375000|16|12|-|-",
42:"2|94|156000|10|85|1|-",
45:"0|35|55000|-|20|-|entr;0|43|88348|-|290|-|-;1|60|75000|1|99|1|entr",
47:"1|63|81000|-|111|-|-;1|63|102000|11|19|-|prev;1|63|125000|14|54|1|prev;2|95|138000|-|46|1|-;2|103|149900|-|35|-|prev",
48:"0|36|68000|21|237|-|prev;0|36|72000|23|11|-|prev;0|36|78000|14|19|-|-;1|55|110000|19|57|1|prev;1|55|135000|21|82|1|prev",
49:"1|49|75000|1|329|0|prev;1|48|78000|-|156|1|prev;1|55|90600|-|156|1|prev;1|54|92600|-|156|1|prev;2|109|160000|5|125|1|prev",
50:"0|35|75255|-|40|-|prev;1|54|82950|-|165|-|prev",
54:"0|39|58900|-|103|-|-;2|80|135000|8|13|1|-;3|153|240000|2|117|1|-",
55:"0|30|40000|2|152|-|-;1|39|53000|-|151|-|-;2|79|128888|-|78|1|-",
57:"0|35|58500|15|25|-|-;0|35|66000|14|105|1|entr;0|35|69825|14|144|-|-;0|61|112850|6|177|0|entr;1|53|95000|12|118|-|-;1|53|100000|16|9|1|-;2|68|100000|12|71|0|entr;2|84|120000|-|13|1|entr;2|80|145000|6|64|1|entr;2|127|159000|2|113|1|entr;2|84|160000|-|78|-|-",
58:"1|76|145000|3|167|1|-",
60:"2|80|118000|-|20|1|-",
61:"1|48|74880|4|48|0|-;2|74|119000|4|26|1|entr;2|71|145000|-|94|1|-",
63:"2|62|118000|4|10|-|-",
64:"1|44|68200|-|90|0|entr;1|47|70000|2|274|-|-;1|46|70459|4|77|0|entr",
65:"0|44|88100|13|109|-|-;0|43|88244|-|34|1|-;0|46|90386|-|34|1|-;0|44|90842|-|34|1|-;1|45|87750|14|137|-|entr;1|52|100760|16|96|0|entr;1|52|101200|-|106|-|entr;1|52|110000|6|63|1|entr;1|55|110000|-|106|-|entr;1|74|119557|17|50|0|-;1|76|130000|8|21|0|-;2|73|137120|-|106|-|entr;2|83|158660|-|106|-|entr;2|85|162000|-|106|-|entr;2|84|163500|8|119|-|-;2|86|164477|-|34|1|-;2|87|165470|-|106|-|entr;2|80|170000|-|106|1|-;2|86|174000|23|103|1|-;2|93|180000|13|53|-|entr;2|144|256058|8|28|1|-;3|150|294000|-|106|-|entr",
67:"2|67|150000|3|228|-|-",
69:"3|163|250000|-|98|1|-",
70:"0|32|42103|5|116|1|-",
71:"1|64|100000|-|30|1|-",
74:"0|37|53650|-|81|0|-;0|41|72414|-|96|0|-;1|40|65000|-|88|-|entr;1|40|65000|-|90|-|-;2|68|100000|-|70|1|-",
76:"0|34|47100|11|25|-|-;0|34|53000|13|70|0|entr;0|38|55000|-|20|-|-;0|34|65900|15|166|-|entr;0|34|67240|10|131|-|entr;0|38|75300|-|167|-|-;1|40|67385|-|93|0|entr;1|51|70000|11|39|-|-;1|40|78585|-|167|-|-;1|51|97510|15|78|0|entr;2|63|89500|8|132|-|-;2|63|123045|-|167|-|-;2|83|160000|-|93|0|entr",
77:"1|51|105000|-|50|1|-;2|95|190000|-|61|1|-;2|116|220000|-|70|1|-;2|116|223000|5|85|1|-",
80:"2|107|95079|3|6|-|-",
84:"1|31|55000|-|46|0|-;1|42|71500|-|53|-|-;1|47|80600|-|42|-|-;1|47|82590|11|19|-|entr;2|88|131400|-|92|-|prev;2|98|147495|-|92|-|prev",
85:"2|59|86000|-|141|1|entr;2|58|93000|1|110|-|entr",
90:"0|33|65000|-|76|0|-;1|36|55000|-|70|1|entr;1|37|70000|2|78|0|-",
91:"1|53|57565|-|164|-|-;1|54|60255|-|164|-|-;1|52|69000|5|124|-|-;3|114|112031|-|164|-|-",
92:"2|124|200000|-|182|1|-;2|124|218500|12|158|1|-",
95:"2|73|125000|-|298|-|-",
104:"2|88|145000|-|41|1|-",
109:"0|31|69000|-|238|-|-;0|31|75000|2|5|-|-;0|36|75000|2|48|-|-;0|35|85000|-|75|0|-",
112:"1|58|130000|4|29|-|prev;1|58|130000|5|77|0|prev",
113:"1|48|71485|7|4|-|prev;1|57|102000|16|57|1|prev",
120:"1|33|50700|7|62|1|entr",
126:"3|238|320000|-|90|1|-",
129:"1|41|85000|2|133|-|-;1|44|88000|-|83|1|-",
135:"1|42|50037|-|35|-|-;1|42|64444|-|40|0|-;1|50|90000|-|11|-|-;2|65|127000|-|112|-|-",
139:"2|152|275000|-|54|1|-",
142:"1|65|107407|-|36|-|-;2|149|209000|-|54|1|-",
151:"0|38|68156|3|182|-|entr;0|36|71838|4|182|-|entr;0|40|72019|4|182|-|entr;0|40|72019|2|182|-|entr",
162:"1|47|83046|8|127|-|-;1|58|95000|6|13|-|-",
164:"1|63|87644|2|26|-|-",
167:"3|330|575000|6|132|-|entr",
169:"0|30|82500|-|76|0|-",
219:"3|170|255000|-|116|1|-",
221:"1|56|70000|-|278|1|entr",
222:"0|40|79000|-|68|0|-",
224:"0|36|65000|4|73|1|entr",
226:"0|35|58000|5|25|-|-;0|38|76300|-|42|1|-",
228:"1|42|65000|5|286|-|-;2|73|118000|-|152|1|entr",
248:"0|37|59671|-|167|-|prev;0|48|70000|-|51|1|prev;1|49|75000|-|51|1|prev;1|49|78509|-|167|-|prev;2|56|89709|-|167|-|prev;2|54|98000|-|73|1|prev",
249:"2|81|133650|-|140|0|-",
250:"1|39|62000|6|82|1|-",
252:"0|38|55000|-|13|-|-;1|45|51126|-|111|-|-;1|46|67000|-|19|0|-",
253:"0|47|85000|-|62|0|-;1|47|79000|7|62|-|-",
254:"2|88|126300|3|47|1|-;2|88|130000|-|183|1|-",
255:"1|82|114744|-|133|-|-",
256:"1|50|87000|5|103|-|-",
275:"1|50|130800|2|134|1|-;2|85|180000|-|28|1|-",
278:"2|102|200000|10|106|1|-",
280:"0|42|66000|-|209|-|-;2|85|138000|3|77|1|-;2|104|209799|1|116|1|-",
282:"1|30|60000|-|84|0|-;2|72|120000|-|83|0|-",
283:"0|31|54000|4|113|-|entr;0|33|56000|6|119|-|entr;0|43|60000|-|71|1|entr;0|78|89000|-|71|1|entr;2|66|111332|-|20|1|entr",
284:"2|66|79464|2|60|1|entr",
285:"2|110|115000|2|118|1|entr",
286:"3|115|150000|4|27|1|-",
289:"0|36|75431|-|45|0|-;1|49|84000|2|92|-|entr;2|66|95000|1|28|-|-",
291:"1|37|49500|3|161|-|-;1|37|71121|3|40|0|-",
292:"2|85|135000|-|91|0|entr",
293:"1|75|125000|-|5|1|-",
294:"3|130|135000|-|21|0|-;3|161|139000|0|182|1|-",
301:"0|31|70402|1|98|-|-",
304:"1|75|179000|8|112|1|-",
307:"2|107|140000|-|33|0|-",
321:"0|32|59270|-|167|-|prev;1|37|69882|-|167|-|prev;2|58|108000|5|51|-|prev;2|58|108077|-|167|-|prev",
323:"0|37|76000|3|161|0|-;2|72|132000|-|91|1|entr",
324:"2|72|108000|-|162|-|-",
325:"2|66|110000|4|151|1|-",
326:"0|37|50000|1|14|-|entr;0|34|65846|-|167|-|-;0|36|75000|5|48|0|entr;1|51|98500|-|26|0|prev",
330:"1|44|71000|7|115|1|-",
332:"0|39|75883|4|22|-|prev;1|47|58975|3|5|-|prev",
334:"1|48|64500|-|80|1|-;3|151|190000|2|50|1|-",
336:"1|56|125000|1|118|-|-",
337:"1|49|80000|3|56|0|-;1|51|95000|-|84|1|-",
339:"1|48|98600|-|42|1|entr",
340:"2|113|198000|-|46|1|-",
341:"2|116|145000|-|103|-|-",
342:"1|52|97000|-|146|1|-",
345:"3|169|160000|-|84|1|-",
346:"0|32|47000|1|50|-|prev;1|41|60990|-|82|0|prev",
349:"2|76|120000|2|91|-|entr;2|90|139000|1|91|-|entr;2|90|141000|2|91|-|entr",
351:"2|86|120296|9|101|1|-",
499:"1|81|133000|0|40|-|-;1|109|185000|-|67|0|-;2|154|280000|-|67|1|-;3|223|359900|-|20|1|-;3|224|367000|1|40|1|-;3|223|367000|1|40|1|-;3|215|374000|-|67|1|-;3|699|1040000|4|36|1|-",
521:"2|109|135000|-|47|1|-",
523:"0|33|68820|-|34|0|prev",
524:"0|32|52500|-|71|-|prev;0|34|55500|-|71|0|prev;0|35|57000|-|71|0|prev;0|35|58000|-|71|0|prev;0|36|59500|-|71|0|prev;0|37|61000|-|71|-|prev;1|44|72500|-|71|-|prev;1|43|85500|-|64|-|prev;1|43|86500|-|64|-|prev;1|41|88000|-|64|0|prev",
525:"1|53|97000|-|71|-|prev;1|57|104000|-|71|-|prev",
527:"3|173|278000|-|28|1|-",
528:"2|90|140000|-|27|-|-",
529:"1|50|75968|-|18|-|prev;1|50|77981|0|26|-|prev;1|50|78484|0|26|-|prev;3|154|182971|2|26|0|prev"
};
/* rangos p25/p50/p75 del $/m2 por zona × dormitorios (solo grupos n>=5) */
var R={
 EC:{0:[1693,1906,2064,33],1:[1539,1688,1920,65],2:[1500,1648,1762,41],3:[1552,1644,1680,16]},
 EN:{0:[1850,1948,2016,7],1:[1749,2040,2165,19],2:[1549,1833,2021,15]},
 EO:{0:[1450,1671,1850,13],1:[1218,1465,1700,17],2:[1624,1643,1648,14]},
 SI:{0:[1652,1845,2002,32],1:[1646,1837,1987,36],2:[1673,1865,1940,31]},
 VB:{0:[1459,1500,1787,11],1:[1456,1559,1658,18],2:[1529,1611,1689,15]}
};
/* polígonos de zonas (PostGIS, simplificados) — [zona, [[lon,lat],...]] */
var POLY=[
["SI",[[-63.196956,-17.763226],[-63.200830,-17.757115],[-63.202580,-17.761791],[-63.205430,-17.765661],[-63.203173,-17.767973],[-63.196956,-17.763226]]],
["VB",[[-63.192975,-17.760926],[-63.191753,-17.760325],[-63.190851,-17.754881],[-63.191347,-17.753049],[-63.192424,-17.752420],[-63.198136,-17.754935],[-63.192975,-17.760926]]],
["EC",[[-63.191214,-17.772778],[-63.188678,-17.771781],[-63.191128,-17.767124],[-63.192073,-17.762510],[-63.198756,-17.766720],[-63.201543,-17.769432],[-63.194637,-17.770297],[-63.191214,-17.772778]]],
["EO",[[-63.191120,-17.772860],[-63.194522,-17.770388],[-63.201504,-17.769449],[-63.202455,-17.772040],[-63.191768,-17.773465],[-63.191120,-17.772860]]],
["EN",[[-63.198641,-17.760379],[-63.195373,-17.758388],[-63.198161,-17.754962],[-63.200894,-17.756774],[-63.198641,-17.760379]]],
["EN",[[-63.198673,-17.760397],[-63.196742,-17.763310],[-63.192972,-17.760959],[-63.195368,-17.758393],[-63.198673,-17.760397]]],
["A3",[[-63.202862,-17.767992],[-63.201675,-17.769368],[-63.199799,-17.767324],[-63.191766,-17.762294],[-63.191720,-17.760389],[-63.199413,-17.765142],[-63.202862,-17.767992]]]
];
/* preventa por edificio: [avisos_preventa, "fechas de entrega declaradas"] (BD 3-ago) */
var PV={1:[3,"Enero 2026;Mayo 2026"],2:[8,"Mayo 2026"],3:[2,"Junio 2027"],8:[1,null],12:[5,"Diciembre 2025"],16:[5,"Diciembre 2026"],17:[16,"Julio 2026;Septiembre 2026"],19:[2,"Diciembre 2026"],47:[3,"Noviembre 2026"],48:[4,"Julio 2026;Junio 2026"],49:[5,"Diciembre 2026;Octubre 2026"],50:[2,"Junio 2027"],84:[2,null],112:[2,"Febrero 2026"],113:[2,"Junio 2027"],248:[6,"Julio 2026"],321:[4,null],326:[1,"Septiembre 2026"],332:[2,null],346:[2,"Diciembre 2026;Septiembre 2026"],523:[1,null],524:[10,"Marzo 2028"],525:[2,null],529:[4,null]};
var MESNUM={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,octubre:10,noviembre:11,diciembre:12};
function entregaInfo(pm){
  var v=PV[pm]; if(!v)return null;
  var fs=(v[1]?v[1].split(';'):[]).map(function(s){var p=s.trim().toLowerCase().split(/\s+/);
    return {y:+p[1],m:MESNUM[p[0]]||6,txt:s};}).sort(function(a,b){return (a.y*100+a.m)-(b.y*100+b.m)});
  var HOY=META.corteYM, bucket='sinfecha';
  if(fs.length){var k=fs[0].y*100+fs[0].m;
    bucket = k<HOY?'vencida':(fs[0].y===2026?'a2026':(fs[0].y===2027?'a2027':'a2028'));}
  return {prev:v[0],fechas:fs,bucket:bucket};
}
/* alquiler por edificio: pm:[avisos, Bs mediano mensual] (BD 3-ago, 189 avisos, 77 edificios) */
var AL={30:[10,5600],65:[9,5500],15:[9,4800],41:[5,4200],101:[4,4500],129:[4,4750],36:[4,3350],22:[4,5000],278:[3,9800],6:[3,11500],350:[3,3600],222:[3,4000],84:[2,3850],38:[2,4335],109:[2,6650],42:[2,3850],135:[2,4550],45:[2,3500],141:[2,7830],516:[2,3100],144:[2,4900],13:[2,7000],5:[2,4500],166:[2,9800],18:[2,4000],64:[2,3000],226:[2,3500],67:[2,2800],23:[2,11500],282:[2,3350],71:[2,9200],288:[2,3300],11:[2,3150],305:[2,6500],324:[1,3500],326:[1,3500],336:[1,4500],339:[1,4000],347:[1,3000],348:[1,3000],351:[1,7500],520:[1,4500],526:[1,6800],530:[1,4500],7:[1,3900],9:[1,3350],28:[1,8800],33:[1,3500],54:[1,4200],57:[1,3500],60:[1,null],61:[1,4200],70:[1,3500],74:[1,3300],76:[1,null],77:[1,3250],87:[1,3700],89:[1,3500],95:[1,3000],112:[1,5800],140:[1,3200],147:[1,2800],162:[1,3200],169:[1,3500],218:[1,6264],219:[1,4200],228:[1,8500],249:[1,5500],252:[1,4000],284:[1,3000],289:[1,3000],297:[1,null],299:[1,7100],306:[1,4200],312:[1,3650],320:[1,6500],323:[1,9200]};
/* edificios SOLO-alquiler (sin venta activa hoy): [pm,nombre,lat,lon,zona] */
var BA=[
[101,"Garden Equipetrol",-17.75623,-63.19416,"VB"],[350,"Smart Soul",-17.76339,-63.19901,"SI"],
[141,"SKY Lumiere",-17.76080,-63.19584,"EN"],[516,"Santorini Suites",-17.76277,-63.19836,"SI"],
[144,"Sky Collection Tulip",-17.76487,-63.20320,"EC"],[166,"Condominio Iguazú",-17.77232,-63.19227,"EO"],
[288,"Baruc II",-17.76570,-63.19597,"EC"],[11,"SAOTA Park",-17.77000,-63.19951,"EO"],
[305,"Impera Tower",-17.76466,-63.20209,"SI"],[347,"Baruc 3",-17.77256,-63.19458,"EO"],
[348,"One Life Sirari",-17.76289,-63.19924,"EC"],[520,"Torre Sirari",-17.76750,-63.20277,"SI"],
[526,"Mai Suites",-17.76363,-63.20339,"SI"],[530,"Edificio MAIA",-17.76415,-63.20296,"SI"],
[28,"Macororo 12",-17.76793,-63.19925,"EC"],[33,"Edificio Murure",-17.76824,-63.19459,"EC"],
[87,"Stratto Equipetrol",-17.75875,-63.19522,"EN"],[89,"Edificio Gold",-17.76375,-63.19240,"EC"],
[140,"Sky Plaza",-17.76169,-63.19994,"SI"],[147,"Edificio Baruc Uno",-17.76719,-63.19497,"EC"],
[218,"Edificio Macororó 11",-17.76349,-63.19328,"EC"],[297,"Eurodesign Residences",-17.76516,-63.19181,"EC"],
[299,"Edificio Lateris",-17.77275,-63.19133,"EC"],[306,"Infinity by Elite",-17.76676,-63.20277,"SI"],
[312,"Condominio Domus Deluxe",-17.76449,-63.19327,"EC"],[320,"Condominio Metta",-17.76136,-63.19902,"SI"]];
/* libro de ALQUILER por edificio: "dorms|m2|bob_mes|amoblado|dias" (BD 3-ago, 189 avisos) */
var UA={3:"1|42|3800|si|36",5:"1|38|4000|-|19;1|48|5000|si|54",6:"2|100|7600|si|52;2|145|11500|si|60;2|100|16000|-|41",7:"0|36|3900|si|80",9:"0|38|3350|-|11",11:"0|27|2800|-|11;0|27|3500|si|75",13:"1|42|-|-|11;2|86|7000|-|12",15:"0|42|4300|si|84;0|42|4500|si|82;0|42|4600|si|105;0|42|4800|si|105;0|42|4800|si|141;0|42|4800|si|81;1|74|7000|-|27;2|84|8500|-|18;2|105|10500|-|47",18:"0|32|4000|si|15;1|61|4000|-|57",22:"0|45|4700|si|40;1|53|5000|-|71;1|67|5000|-|76;1|53|5200|si|28",23:"1|83|11500|si|68;1|96|-|si|48",28:"3|104|8800|-|34",30:"0|40|4300|si|43;0|42|4500|-|27;0|40|4500|si|89;0|42|5000|-|91;1|68|5300|-|119;1|65|5900|si|41;2|95|7500|-|50;2|105|7500|-|73;2|105|9500|si|50;2|106|9800|si|42",33:"0|31|3500|si|48",36:"0|33|3300|si|113;0|32|3350|si|35;0|32|3650|si|54;1|46|-|si|7",38:"1|52|4200|-|14;1|59|4470|-|83",41:"0|42|3700|-|22;1|48|4200|-|19;1|74|5500|si|15;1|47|-|-|50;1|45|-|-|50",42:"1|45|3200|-|83;1|46|4500|si|110",45:"0|35|3500|si|19;1|78|-|si|6",54:"1|50|4200|-|31",57:"0|39|3500|-|28",60:"3|168|-|si|13",61:"1|47|4200|si|39",64:"0|41|3000|-|29;2|73|-|-|53",65:"0|44|4900|si|75;0|43|5200|-|6;0|44|5500|si|41;1|50|5000|-|26;1|42|5500|si|34;1|45|6500|-|47;1|52|7000|si|35;2|94|9000|-|5;2|84|10000|si|20",67:"0|39|2600|-|20;0|32|3000|si|24",70:"0|32|3500|si|8",71:"2|107|5900|-|138;3|213|12500|-|32",74:"0|40|3300|si|40",76:"1|51|-|-|4",77:"0|35|3250|si|14",84:"1|43|3500|-|29;1|37|4200|-|64",87:"0|41|3700|si|40",89:"1|44|3500|semi|50",95:"0|31|3000|si|97",101:"0|36|3500|si|54;1|47|4500|-|29;1|48|4500|si|54;1|48|-|si|81",109:"1|55|6000|-|15;2|73|7300|-|41",112:"1|56|5800|-|6",129:"1|42|4200|si|40;1|44|4500|si|56;1|44|5000|semi|82;2|65|5800|si|20",135:"1|42|4100|si|53;1|42|5000|si|18",140:"0|55|3200|si|103",141:"2|103|7656|-|46;2|103|8004|-|76",144:"1|44|4000|-|14;2|80|5800|si|55",147:"0|34|2800|si|25",162:"1|56|3200|si|54",166:"3|148|9800|semi|40;3|168|-|-|71",169:"1|30|3500|si|76",218:"3|103|6264|-|43",219:"1|43|4200|si|27",222:"0|38|2900|-|76;0|40|4000|si|27;0|38|4200|si|62",226:"0|35|3500|si|62;1|34|3500|-|105",228:"2|73|8500|si|57",249:"1|60|5500|si|117",252:"1|46|4000|si|104",278:"2|102|8000|si|92;2|138|9800|-|13;2|130|10200|si|102",282:"0|33|3400|si|18;1|37|3300|-|28",284:"1|40|3000|-|28",288:"0|33|3300|si|13;0|33|3300|si|57",289:"0|38|3000|si|8",297:"3|115|-|-|71",299:"3|177|7100|si|147",305:"2|75|6500|-|62;2|75|-|si|14",306:"0|60|4200|si|41",312:"0|38|3650|si|18",320:"2|80|6500|si|138",323:"3|137|9200|si|52",324:"1|37|3500|si|56",326:"0|37|3500|si|13",336:"1|54|4500|si|33",339:"1|43|4000|si|118",347:"0|38|3000|si|33",348:"0|31|3000|si|43",350:"0|34|2800|si|1;0|36|3600|si|29;2|60|4500|-|22",351:"2|86|7500|si|102",516:"0|33|2800|si|48;0|31|3400|-|74",520:"1|54|4500|si|81",526:"1|80|6800|si|45",530:"2|80|4500|-|22"};
/* amenidades DECLARADAS por edificio (lista + extra de todos sus avisos, BD 3-ago) */
var AMS={1:"Churrasquera;Co-working;Piscina;Sala de juegos",2:"Churrasquera;Co-working;Estacionamiento para Visitas;Gimnasio;Lobby;Lounge;Piscina",3:"Churrasquera;Co-working;Gimnasio;Lounge;Piscina;Salón de Eventos;Sport bar",5:"Estacionamiento para Visitas",6:"Piscina",7:"Churrasquera;Co-working;Gimnasio;Piscina;Sala de reuniones;Sauna/Jacuzzi",9:"Churrasquera;Co-working;Gimnasio;Piscina;Sala de juegos;Sala de TV;Salón de Eventos;Sauna/Jacuzzi",12:"Área de juegos;Churrasquera;Co-working;Estacionamiento para Visitas;Lavandería;Lounge;Piscina;Salón de Eventos",13:"Billar;Churrasquera;Lavandería común;Piscina;Salón de Eventos;Sauna/Jacuzzi;Sport Bar;Terraza",15:"Business Center;Cancha de pádel;Churrasquera;Co-working;Estacionamiento para Visitas;Gimnasio;Mirador;Piscina;Sala de copropietarios;Sala de juegos;Salas de reuniones;Salón de Eventos;Sauna/Jacuzzi;Solárium;Terraza panorámica",17:"Churrasquera;Deck;Lounge;Piscina",18:"Churrasquera;Co-working;Edificio ecosostenible;Gimnasio;Lavandería;Lobby;Lounge;Mesa de billar;Piscina;Portero facial / control de acceso;Salas de TV;Sauna/Jacuzzi;Sistema contra incendios;Sky bar",19:"Churrasquera;Co-working;Gimnasio;Jardín;Lounge;Piscina;Sala de juegos;Sala de reuniones;Salón de Eventos;Sauna/Jacuzzi",21:"Ascensor;Churrasquera;Estacionamiento para Visitas;Piscina;Sauna/Jacuzzi;Seguridad 24/7",22:"Churrasquera;Co-working;Estacionamiento para Visitas;Gimnasio;Piscina;Sala de Cine;Sala de TV;Salón de Eventos;Sauna/Jacuzzi",23:"Churrasquera;Gimnasio;Lavandería;Parque Infantil;Piscina;Plaza gastronómica;Sala de juegos;Salón de Eventos;Sauna/Jacuzzi;Sky bar",25:"Cabañas;Churrasquera;Estacionamiento para Visitas;Gimnasio;Piscina;Sala de juegos;Sala de niños;Salón de Eventos;Sauna/Jacuzzi",27:"Churrasquera;Piscina;Sauna/Jacuzzi",30:"Ascensores;Billar;Churrasquera;Co-working;Deck panorámico;Gimnasio;Jardín;Lobby;Piscina;Sala de juegos;Sala de TV;Salas de reuniones;Salas lounge;Salón de Eventos;Sauna/Jacuzzi;Seguridad 24 horas;Wellness Center",34:"Canchas;Gimnasio;Jardín;Lavandería;Piscina;Sala de Juegos;Salón de Eventos",36:"Churrasquera;Co-working;Piscina",37:"Churrasquera;Estacionamiento para Visitas;Gimnasio;Locales comerciales;Piscina;Salón de Eventos;Sauna/Jacuzzi",38:"Bar;Churrasquera;Co-working;Gimnasio;Piscina;Salón de Eventos",40:"Área de esparcimiento;Área Social;Churrasquera",41:"Churrasquera;Circuito de calistenia;Co-working;Gimnasio;Lavandería;Piscina;Sala de juegos;Sala de TV;Salón de Eventos;Sauna/Jacuzzi",42:"Churrasquera;Piscina",45:"Áreas sociales;Ascensor;Churrasquera;Co-working;Gimnasio;Piscina;Salón de Eventos;Salón multifuncional;Terraza panorámica",47:"Acceso inteligente;Área de Yoga;Ascensores de alta velocidad;Churrasquera;Co-working;Cocina gourmet;Gimnasio;Jardín;Piscina;Sala de juegos;Salón de Eventos;Salón Rooftop;Sauna/Jacuzzi;Seguridad privada 24/7;Spa con sala de masajes",48:"Churrasquera;Gimnasio;Jardín;Piscina;Sala de juegos;Sauna/Jacuzzi;Wellness Center",49:"Churrasquera;Co-working;Deck;Lavandería;Piscina;Sala de entretenimiento;Sala de reuniones;Salón de Eventos;Sauna/Jacuzzi",50:"Co-working;Piscina;Sala de reuniones",54:"Área de lavadoras común;Churrasquera;Cine;Game Room;Gimnasio;Lavandería;Pet Friendly;Piscina",55:"Churrasquera;Piscina;Salón de Eventos",57:"Churrasquera;Cine;Co-working;Estación de carga autos eléctricos;Estacionamiento para Visitas;Game Room;Gimnasio;Lavandería;Parque Infantil;Piscina;Rooftop;Sala de juegos;Sala de masajes;Sauna/Jacuzzi",58:"Estacionamiento para Visitas;Gimnasio;Piscina;Sauna/Jacuzzi",60:"Churrasquera;Piscina;Salón de Eventos",61:"Churrasquera;Co-working;Estacionamiento para Visitas;Gimnasio;Lobby;Piscina;Sala de TV",63:"Churrasquera;Co-working;Lavandería;Piscina;Restaurante;Terraza",64:"Churrasquera;Co-working;Lavandería;Piscina;Sala de juegos;Salón de Eventos",65:"Áreas de yoga;Áreas verdes en Terraza;Bar;Billar;Churrasquera;Cine VIP;Co-working;Cocina del Chef;Espacios de recreación y descanso;Gimnasio;Jardín;Karaoke;Lounge & terraza;Mirador;Parque Infantil;Paseo forestal;Piscina;Recepción;Sala de cine;Sala de reuniones;Sala social con bar;Salón de Eventos;Sauna/Jacuzzi;Spa;Terraza Zen",67:"Bar;Churrasquera;Co-working;Lounge;Piscina;Salón de Eventos",69:"Piscina;Salón de Eventos;Sauna/Jacuzzi",70:"Churrasquera;Piscina;Salón de Eventos",71:"Churrasquera;Gimnasio;Piscina;Salón de Eventos;Sauna/Jacuzzi",74:"Churrasquera;Gimnasio;Piscina",76:"Billar;Churrasquera;Cine;Co-working;Fogatero;Gimnasio;Lavandería;Minimarket;Piscina;Sala de entrenamiento;Sala de juegos;Sala de uso múltiple;Salón de Eventos",77:"Churrasquera;Co-working;Espacio de meditación;Gimnasio;Huerto;Lobby amoblado;Piscina;Sala de juegos;Salón de Eventos",80:"Churrasquera;Circuito cerrado de cámaras;Co-working;Lavandería común por piso;Lobby;Salón de Eventos;Sauna/Jacuzzi;Terrazas",84:"Áreas sociales amobladas;Ascensores;Billar;Churrasquera;Co-working;Control de acceso facial;Fogatero;Gimnasio;Lavandería;Lobby;Piscina;Sala de TV;Salón de Eventos;Sauna/Jacuzzi;Sky bar",85:"Área Social;Ascensor;Estacionamiento para Visitas;Terraza con vegetación nativa",90:"Churrasquera;Co-working;Gimnasio;Piscina;Salón de Eventos",91:"Churrasquera;Co-working;Gimnasio;Piscina;Sala de juegos;Sala de TV;Terraza",92:"Churrasquera;Gimnasio;Jardín;Piscina;Salón de Eventos",95:"Churrasquera;Co-working;Piscina;Salón de Eventos",104:"Churrasquera;Cine;Co-working;Gimnasio;Piscina;Salón de Eventos;Terraza",109:"Área Social;Churrasquera;Gimnasio;Piscina;Sala de juegos;Sala de reuniones;Sala de TV;Salón de Eventos;Sauna/Jacuzzi",112:"Churrasquera;Co-working;Deck solarium;Gimnasio;Piscina;Sala de Uso múltiple;Salón de Eventos;Sauna/Jacuzzi",113:"Churrasquera;Co-working;Gimnasio;Piscina;Sala de juegos;Sala de TV",120:"Churrasquera;Co-working;Piscina;Salón de Eventos",126:"Churrasquera;Gimnasio;Piscina;Salón de Eventos",129:"Estacionamiento para Visitas;High Tech Kitchen;iMac Lounge;Netflix Room;Piscina;Sky Fusion Grill;VR Room",135:"Churrasquera;Co-working;Gimnasio;Piscina;Sala de reuniones;Salón de Eventos;Sauna/Jacuzzi;Seguridad 24/7",142:"Churrasquera;Gimnasio;Lavandería;Piscina;Sala de juegos;Sala de televisión;Salón de área social",151:"Piscina;Salón de Eventos;Sauna/Jacuzzi;Sistema de seguridad;Terraza",162:"Churrasquera;Co-working;Gimnasio;Piscina;Salón de Eventos",164:"Ascensor;Churrasquera;Gimnasio;Piscina;Terraza",167:"Churrasquera;Galería;Piscina",169:"Churrasquera;Piscina",219:"Churrasquera;Lounge;Piscina;Salón de Eventos;Sauna/Jacuzzi",221:"Churrasquera;Piscina;Sala de TV;Salón de Eventos;Sauna/Jacuzzi",224:"Estacionamiento para Visitas;Piscina",226:"Churrasquera;Co-working;Lavandería;Piscina",228:"Churrasquera;Gimnasio;Lavandería;Piscina;Salón de Eventos",248:"Churrasquera;Co-working;Gimnasio;Jardín;Lavandería;Minimarket;Parque Infantil;Piscina;Sala de cine;Sala de entrenamiento;Sala social;Sauna/Jacuzzi",249:"Churrasquera;Gimnasio;Piscina;Salón de Eventos",250:"Churrasquera;Piscina",252:"Churrasquera;Lavandería;Piscina;Salón de Eventos;Terraza",253:"Churrasquera;Piscina",254:"Churrasquera;Club House;Piscina",255:"Churrasquera;Gimnasio;Piscina",256:"Gimnasio",275:"Churrasquera;Co-working;Gimnasio;Piscina;Salas de TV;Sauna/Jacuzzi",278:"Churrasquera;Piscina;Sala de billar;Sauna/Jacuzzi",280:"Área de descanso;Churrasquera;Futbolín;Gimnasio;Mesa de billar;Piscina;Sala lounge social;Sala multifuncional;Salón de Eventos",282:"Churrasquera;Lavandería;Piscina;Sala de TV",283:"Churrasquera;Co-working;Gimnasio;Lavandería;Piscina;Salón de Eventos",284:"Churrasquera;Co-working;Gimnasio;Piscina;Sala de TV;Seguridad 24/7",285:"Bar;Churrasquera;Gimnasio;Piscina",286:"Churrasquera;Piscina;Salón de Eventos;Sauna/Jacuzzi;Seguridad 24h",289:"Churrasquera;Deck;Lavandería;Lobby;Piscina;Sala multiusos;Seguridad 24/7",292:"Churrasquera;Terraza",293:"Churrasquera;Gimnasio;Piscina;Salón de Eventos",294:"Churrasquera;Gimnasio;Piscina;Salón de Eventos;Sauna/Jacuzzi",301:"Estacionamiento para Visitas;Sauna/Jacuzzi",304:"Churrasquera;Piscina",307:"Gimnasio;Piscina;Restaurante;Sauna/Jacuzzi",321:"Bar Mirador;Churrasquera;Co-working;Fogateros;Gimnasio;Minimarket;Piscina;Sala de entrenamiento;Salón de Eventos",323:"Gimnasio",324:"Churrasquera;Co-working;Gimnasio;Lavandería;Piscina;Sala de reuniones;Sauna/Jacuzzi",325:"Churrasquera;Seguridad;Terraza",326:"Bar con mesa de billar;Churrasquera;Cine;Co-working;Gimnasio;Minimarket;Piscina;Sala de entrenamiento;Sala de juegos",330:"Churrasquera;Piscina",334:"Estacionamiento para Visitas;Piscina",336:"Churrasquera;Gimnasio;Piscina;Sauna/Jacuzzi",337:"Billar;Churrasquera;Gimnasio;Piscina;Sala de TV;Sauna/Jacuzzi",341:"Ascensor de servicio;Ascensor social;Churrasquera;Gimnasio;Parque Infantil;Piscina;Salón de Eventos;Sauna/Jacuzzi",342:"Churrasquera;Gimnasio;Piscina;Salón de Eventos",346:"Churrasquera;Co-working;Gimnasio;Piscina",351:"Churrasquera;Gimnasio;Piscina;Sala de estar con TV",499:"Churrasquera;Gimnasio;Parque Infantil;Piscina;Sala de masajes;Salón de Eventos;Sauna/Jacuzzi;Spa",521:"Churrasquera;Piscina",524:"Churrasquera;Co-working;Gimnasio;Piscina;Sala de juegos;Sala de reuniones;Sauna/Jacuzzi",525:"Churrasquera;Co-working;Control de acceso automatizado;Piscina;Recepción;Sala de reuniones;Salón de Eventos;Seguridad 24/7",527:"Área Social;Ascensor;Recepción;Seguridad 24/7",528:"Gimnasio;Piscina",529:"Churrasquera;Co-working;Gimnasio;Lavandería;Piscina;Sala de juegos;Sala de TV;Salón de Eventos;Terrazas ambientadas"};
/* estándar de mercado = lo declara la mayoría de los edificios de la zona (prevalencia BD) */
var AM_STD=['piscina','churrasquera','gimnasio','co-working','salón de eventos','sauna/jacuzzi'];
function amsDe(pm){
  var raw=AMS[pm]; if(!raw)return [];
  var vistos={},out=[];
  raw.split(';').forEach(function(t){var k=t.trim().toLowerCase();
    if(!k||vistos[k])return; vistos[k]=1; out.push({t:t.trim(),k:k});});
  return out;
}
function colAlq(bob){ if(bob==null)return '#555'; /* rampa = p05-p95 de la propia data (CTX) */
  var r=CTX.rampaBob, t=Math.max(0,Math.min(1,(bob-r[0])/(r[1]-r[0])));
  return t<0.5? mix('#5E9C72','#E0CE96',t*2) : mix('#E0CE96','#D07A4A',(t-0.5)*2);}
/* serie reexpresada COMPLETA (58 cortes desde 5-ene, se omite el 3-ene por TC atípico):
   fechas, TC paralelo del día, y por tipología: usd_m2, bs_m2, n de avisos */
var TMD={
f:["01-05","01-15","01-20","01-21","01-24","01-27","01-29","01-30","01-31","02-05","02-10","02-17","02-18","02-24","03-04","03-06","03-07","03-08","03-10","03-11","03-13","03-15","03-17","03-22","03-24","04-15","04-18","04-22","04-23","04-24","04-28","04-29","05-01","05-02","05-04","05-05","05-06","05-08","05-10","05-12","05-21","05-23","05-30","06-13","06-20","06-24","06-27","06-29","07-02","07-08","07-09","07-10","07-12","07-13","07-15","07-16","07-18","07-21"],
tc:[9.67,9.72,9.66,9.72,9.66,9.50,9.34,9.09,9.15,9.25,9.33,9.26,9.16,9.21,9.01,9.13,9.21,9.35,9.54,9.45,9.33,9.28,9.41,9.28,9.38,9.28,9.34,9.46,9.52,9.64,9.73,9.86,10.09,9.79,9.86,9.80,9.90,9.95,10.02,9.93,10.00,10.28,10.19,9.94,9.88,9.96,9.90,9.95,9.90,9.97,10.22,10.31,10.54,10.42,10.47,10.62,10.68,10.76],
d:{
0:{u:[2103,2094,2081,2083,2068,2041,2014,2014,2039,2076,2103,2076,2071,2076,2055,2052,2052,1897,1932,1901,1897,1901,1897,1894,1892,1894,1960,1980,1975,1980,1960,1960,1955,1955,1965,1966,1958,1958,1958,1970,1975,1982,1975,1937,1799,1757,1799,1799,1748,1748,1724,1704,1698,1693,1698,1704,1705,1715],
   b:[20331,20350,20113,20249,19976,19389,18803,18317,18663,19213,19616,19229,18971,19130,18516,18726,18902,17745,18431,17968,17700,17629,17844,17573,17738,17577,18302,18731,18797,19084,19066,19317,19721,19139,19374,19254,19394,19492,19629,19558,19758,20374,20129,19250,17775,17499,17802,17904,17297,17423,17624,17565,17905,17638,17780,18085,18214,18446],
   n:[45,46,43,42,40,38,40,40,43,44,43,48,47,52,61,64,64,64,62,63,64,65,66,73,71,87,90,92,91,92,94,92,94,96,94,95,92,90,94,92,87,88,82,77,66,62,63,64,63,59,63,62,62,61,60,63,67,66]},
1:{u:[2002,2057,2059,2075,2075,2092,2055,2055,2064,2091,2055,2052,2052,2055,2055,2055,2055,2002,1999,1996,1996,2002,2002,2002,2002,1957,1911,1903,1911,1907,1800,1813,1813,1812,1812,1812,1821,1906,1800,1810,1800,1802,1800,1789,1800,1780,1792,1797,1750,1750,1718,1718,1703,1718,1716,1718,1711,1700],
   b:[19360,19987,19896,20170,20045,19874,19194,18684,18892,19353,19165,19007,18798,18931,18516,18750,18927,18731,19072,18868,18621,18575,18835,18583,18775,18164,17845,17996,18185,18373,17514,17876,18297,17742,17861,17749,18040,18976,18046,17973,18010,18516,18347,17780,17784,17728,17736,17882,17321,17448,17561,17705,17948,17894,17964,18238,18275,18285],
   n:[91,98,97,96,96,97,100,99,100,99,90,94,94,96,121,123,122,123,116,117,117,114,113,109,107,109,119,113,107,108,128,127,135,136,132,132,122,126,127,121,138,136,151,141,141,148,146,139,144,143,141,139,139,133,132,127,143,146]},
2:{u:[2070,2104,2104,2104,2104,2104,2069,2064,2059,1943,2005,2007,2007,1924,1982,1962,1976,1855,1822,1773,1776,1776,1779,1805,1793,1781,1801,1811,1809,1811,1810,1811,1826,1822,1822,1822,1841,1822,1812,1822,1741,1705,1705,1648,1646,1647,1648,1647,1611,1611,1610,1611,1603,1600,1600,1605,1614,1611],
   b:[20008,20446,20333,20451,20324,19988,19308,18768,18841,17976,18705,18591,18387,17731,17860,17908,18199,17355,17383,16766,16566,16470,16730,16753,16811,16529,16822,17128,17214,17451,17615,17853,18425,17842,17963,17850,18236,18138,18159,18090,17415,17524,17377,16378,16264,16403,16306,16390,15941,16057,16461,16598,16903,16666,16749,17040,17243,17328],
   n:[76,79,82,82,82,81,91,88,89,98,88,93,93,100,103,104,105,105,95,96,98,94,92,97,98,99,102,106,108,108,109,106,110,109,109,109,103,109,107,111,118,117,123,129,123,130,131,128,126,120,121,122,118,113,115,114,118,117]}
}};
var MES={"01":"enero","02":"febrero","03":"marzo","04":"abril","05":"mayo","06":"junio","07":"julio"};

/* ============ META + CTX: una sola fuente para cada número ============ */
/* META: hechos del corte NO derivables de los datos embebidos. Se declaran UNA vez acá. */
var META={corte:'3-ago-2026', corteYM:202608,
 avisosVenta:402, avisosAlq:189, oficinas:59, captadores:221, matchPct:87,
 salidasJul:72, dias2dSalida:185,
 preventaFeed:100, amobDeclarado:54, /* del feed completo (la data embebida cubre solo lo anclado) */
 entregasConFecha:65, entregasVencidas:22, entRes2026:32, ent2027:6, ent2028:5,
 rangoDentro:69, rangoFuera:83, /* antigüedad mediana dentro vs sobre el rango (análisis DB) */
 topCaptadora:{n:21, ofi:'RE/MAX Union'},
 pisoAlto:'+14,6%', pisoAltoPct:14.6, errorSerie:'±7%'};
/* CONF: las POLÍTICAS editoriales, decididas UNA vez — adaptarse a cambios = ajustar acá, no reescribir textos */
var CONF={diasRapido:60, diasLento:100,
 umbralContrastePct:5,  /* un contraste de atributo es publicable si Δ ≥ 5% ... */
 nMinContraste:30,      /* ... y n ≥ 30 por lado; si no: 'n insuf.' o '≈ 0' */
 nMinBase:5,            /* mediana publicable con 5+ unidades; si no: 's/base' */
 brechaMonedaPts:5,     /* USD y Bs 'cuentan historias distintas' si difieren ≥ 5 puntos */
 umbralEstandar:0.5};   /* amenidad 'estándar de mercado' si la declara ≥ 50% de los edificios */
function p50(a){if(!a.length)return null;var s=a.slice().sort(function(x,y){return x-y});return s[Math.floor(s.length/2)]}
function pq(a,q){if(!a.length)return null;var s=a.slice().sort(function(x,y){return x-y});return s[Math.max(0,Math.min(s.length-1,Math.round(q*(s.length-1))))]}
/* CTX: TODO lo demás se CALCULA de la data embebida — al refrescar la data, esto se recalcula solo */
var CTX=(function(){
  var c={};
  var zonaDe={};B.forEach(function(b){var k=Math.floor(b[0]);if(!(k in zonaDe))zonaDe[k]=b[4]});
  var us=[];Object.keys(UN).forEach(function(pm){UN[pm].split(';').forEach(function(s){var f=s.split('|');
    us.push({z:zonaDe[pm],d:f[0],a:+f[1],p:+f[2],dias:+f[4],m2:Math.round(+f[2]/+f[1])});});});
  c.nUnidades=us.length;
  c.m2Gen=p50(us.map(function(u){return u.m2}));
  c.diasGen=p50(us.map(function(u){return u.dias}));
  c.zonas=Object.keys(Z).filter(function(z){return z!=='A3'}).map(function(z){
    var uz=us.filter(function(u){return u.z===z});
    return {code:z,nombre:Z[z],n:uz.length,m2:p50(uz.map(function(u){return u.m2})),dias:p50(uz.map(function(u){return u.dias}))};
  }).sort(function(a,b){return b.m2-a.m2});
  c.zonaTot={};c.zonas.forEach(function(z){c.zonaTot[z.code]=z.n});
  c.zonaTot.A3=us.filter(function(u){return u.z==='A3'}).length;
  c.zCara=c.zonas[0]; c.zBar=c.zonas[c.zonas.length-1];
  var porDias=c.zonas.slice().sort(function(a,b){return a.dias-b.dias});
  c.zRap=porDias[0]; c.zLen=porDias[porDias.length-1];
  c.tipos=[0,1,2,3].map(function(d){var ut=us.filter(function(u){return +u.d===d});
    return {d:d,n:ut.length,m2:p50(ut.map(function(u){return u.m2})),precio:p50(ut.map(function(u){return u.p})),
      area:p50(ut.map(function(u){return u.a})),
      m2p25:pq(ut.map(function(u){return u.m2}),0.25),m2p75:pq(ut.map(function(u){return u.m2}),0.75)};});
  c.pctChico=Math.round(100*(c.tipos[0].n+c.tipos[1].n)/us.length);
  c.premMono=Math.round(100*(c.tipos[0].m2/c.tipos[3].m2-1));
  c.rampaM2=[pq(us.map(function(u){return u.m2}),0.05),pq(us.map(function(u){return u.m2}),0.95)];
  var bobs=Object.keys(AL).map(function(k){return AL[k][1]}).filter(function(x){return x!=null});
  c.rampaBob=[pq(bobs,0.05),pq(bobs,0.95)];
  var top=0;B.forEach(function(b,i){if(b[5]>B[top][5])top=i});c.topIdx=top;c.topNom=B[top][1];c.topN=B[top][5];
  var top10=B.map(function(b){return b[5]}).sort(function(a,b){return b-a}).slice(0,10).reduce(function(a,b){return a+b},0);
  c.top10pct=Math.round(100*top10/META.avisosVenta);
  var prevSum=0;Object.keys(PV).forEach(function(k){prevSum+=PV[k][0]});
  c.preventa=prevSum; c.pctPreventa=Math.round(100*prevSum/META.avisosVenta);
  var conPis=0;Object.keys(AMS).forEach(function(k){if(AMS[k].toLowerCase().indexOf('piscina')>=0)conPis++});
  var eds0={};B.forEach(function(b){eds0[Math.floor(b[0])]=1});
  c.pctPiscinaEdif=Math.round(100*conPis/Object.keys(eds0).length); /* sobre TODOS los edificios del mapa */
  var L=TMD.f.length-1;
  c.serie={};[0,1,2].forEach(function(t){var d=TMD.d[t];
    c.serie[t]={du:(d.u[L]/d.u[0]-1)*100, db:(d.b[L]/d.b[0]-1)*100};});
  c.tcDelta=(TMD.tc[L]/TMD.tc[0]-1)*100;
  c.rotacionJul=Math.round(100*META.salidasJul/META.avisosVenta);
  var eds={};B.forEach(function(b){eds[Math.floor(b[0])]=1});c.nEdificios=Object.keys(eds).length;
  c.nEdifAlq=Object.keys(AL).length; c.soloAlq=BA.length;
  var alq1=[],amobSi=0,amobTot=0;
  Object.keys(UA).forEach(function(k){UA[k].split(';').forEach(function(s){var f=s.split('|');
    amobTot++; if(f[3]==='si')amobSi++;
    if(f[0]==='1'&&f[2]!=='-')alq1.push(+f[2]);});});
  c.alq1D=p50(alq1); c.pctAmob=Math.round(100*amobSi/amobTot);
  return c;
})();
function tokUSD(x){return '$'+fm(Math.round(x))}
function tokPct(x){return (x>0?'+':'')+x.toFixed(1).replace('.',',')+'%'}
CTX.t={
 CORTE:META.corte, NAV:''+META.avisosVenta, NALQ:''+META.avisosAlq, NUNI:''+CTX.nUnidades,
 M2GEN:tokUSD(CTX.m2Gen), DIASGEN:''+CTX.diasGen,
 ZCARA:CTX.zCara.nombre, ZCARA_M2:tokUSD(CTX.zCara.m2), ZCARA_N:''+CTX.zCara.n, ZCARA2:CTX.zonas[1].nombre,
 ZBAR:CTX.zBar.nombre, ZBAR_M2:tokUSD(CTX.zBar.m2), ZBAR_N:''+CTX.zBar.n, ZBAR_D:''+CTX.zBar.dias,
 R_IN:''+META.rangoDentro, R_OUT:''+META.rangoFuera,
 BRECHA_Z:Math.round(100*(CTX.zCara.m2/CTX.zBar.m2-1))+'%',
 ZRAP:CTX.zRap.nombre, ZRAP_D:''+CTX.zRap.dias, ZLEN:CTX.zLen.nombre, ZLEN_D:''+CTX.zLen.dias,
 PCT_CHICO:CTX.pctChico+'%', PREM_MONO:CTX.premMono+'%',
 TOPNOM:CTX.topNom, TOPN:''+CTX.topN, TOP10:CTX.top10pct+'%',
 SAL_J:''+META.salidasJul, ROT_J:CTX.rotacionJul+'%', DIAS2D_SAL:''+META.dias2dSalida,
 PREV_N:''+META.preventaFeed, PREV_PCT:Math.round(100*META.preventaFeed/META.avisosVenta)+'%',
 ENT_V:''+META.entregasVencidas, ENT_F:''+META.entregasConFecha, ENT_26:''+META.entRes2026, ENT_27:''+META.ent2027, ENT_28:''+META.ent2028,
 OFIS:''+META.oficinas, CAPT:''+META.captadores, MATCH:META.matchPct+'%',
 PIS_EDIF:CTX.pctPiscinaEdif+'%', AMOB:META.amobDeclarado+'%',
 SERIE_MIN:tokPct(Math.max(CTX.serie[0].du,CTX.serie[1].du,CTX.serie[2].du)),
 SERIE_MAX:tokPct(Math.min(CTX.serie[0].du,CTX.serie[1].du,CTX.serie[2].du)),
 S2D_USD:tokPct(CTX.serie[2].du), S2D_BS:tokPct(CTX.serie[2].db), TC_D:tokPct(CTX.tcDelta),
 EDIF:''+CTX.nEdificios, EDIF_ALQ:''+CTX.nEdifAlq, SOLO_ALQ:''+CTX.soloAlq, ALQ1D:'Bs '+fm(CTX.alq1D),
 ERR:META.errorSerie, PISO_ALTO:META.pisoAlto,
 A3N:''+CTX.zonaTot.A3
};
function T(s){return s.replace(/\{(\w+)\}/g,function(m,k){return CTX.t[k]!==undefined?CTX.t[k]:m})}
/* self-test: lo calculado debe coincidir (±3%) con lo que antes estaba tipeado a mano */
(function(){var esp={m2Gen:1692,zCaraM2:1893,zBarM2:1557,diasGen:78,topN:22,top10pct:29};
 var got={m2Gen:CTX.m2Gen,zCaraM2:CTX.zCara.m2,zBarM2:CTX.zBar.m2,diasGen:CTX.diasGen,topN:CTX.topN,top10pct:CTX.top10pct};
 var difs=[];Object.keys(esp).forEach(function(k){if(Math.abs(got[k]-esp[k])/Math.max(1,esp[k])>0.03)difs.push(k+': tipeado '+esp[k]+' vs calculado '+got[k])});
 console.info('[CTX self-test]',difs.length?difs:'OK — calculado ≈ tipeado',JSON.stringify(got));})();

/* ============ AM_STD calculado: 'estándar de mercado' = prevalencia ≥ CONF.umbralEstandar ============ */
AM_STD=(function(){
  var cnt={},tot=CTX.nEdificios;
  Object.keys(AMS).forEach(function(pm){amsDe(+pm).forEach(function(a){cnt[a.k]=(cnt[a.k]||0)+1})});
  CTX.amPrev=cnt;
  return Object.keys(cnt).filter(function(k){return cnt[k]/tot>=CONF.umbralEstandar});
})();

/* ============ CONTRASTES: barrido COMPLETO de atributos (amenidades + equipamiento, dentro del 1 dormitorio) ============
   [atributo, $/m² con, n con, $/m² sin, n sin] — TODO el vocabulario con n≥10 (query en README §Refrescar).
   Se embeben TODAS las filas; la POLÍTICA (CONF) decide qué se publica — sin curaduría a dedo. */
var CONTRASTES=[
['Piscina',1700,120,1702,33],
['Churrasquera',1700,107,1701,46],
['Cocina equipada',1700,106,1711,47],
['Gimnasio',1748,76,1650,77],
['Co-working',1700,59,1700,94],
['Aire acondicionado',1795,57,1655,96],
['Salón de Eventos',1640,43,1735,110],
['Balcón',1701,42,1699,111],
['Sauna/Jacuzzi',1873,40,1651,113],
['Termotanque/Calefón',1800,39,1676,114],
['Chapa digital',1700,37,1700,116],
['Roperos/Closets',1691,34,1700,119],
['Box de baño',1754,32,1699,121],
['Vestidor',1837,26,1688,127],
['Heladera',1722,20,1700,133],
['Terraza propia',1848,17,1699,136],
['Microondas',1723,14,1700,139],
['Estacionamiento para Visitas',1835,13,1700,140],
['Domótica',1724,10,1681,143],
['Video portero',1570,10,1702,143]];
/* control de composición de amenidades: bruto [con,nCon,sin,nSin] + control por tipología */
var AMCTRL={bruto:[1668,300,1751,102],
 control:[['1 dormitorio',1700,124,1688,31],['2 dormitorios',1648,77,1673,39],['Monoambiente',1780,77,1975,23]]};

/* ============ EDITORIAL: la voz de ESTA edición — se reescribe en cada refresco (checklist en README) ============ */
var EDITORIAL={
 fecha:'3-ago-2026',
 hallazgos:[
  '<b>La moneda cambia la historia — y la tipología también.</b> En dólares, el m² pedido cayó entre {SERIE_MIN} y {SERIE_MAX} desde enero según la tipología; el 2 dormitorios es el que más cae incluso en Bs ({S2D_BS}): debilidad propia del segmento, no solo efecto del dólar (§02). Si sus costos están en Bs y su lista en USD, ese spread ES su margen.',
  '<b>Los avisos fuera del rango son los más viejos del mercado.</b> Dentro del rango típico: {R_IN} días publicados (mediana); sobre el rango, {R_OUT}. Dos lecturas compatibles — no rota, o quedó desactualizado frente a un mercado que bajó — y ambas ordenan lo mismo: revisar el precio. (Antigüedad de la oferta viva, no tiempo de venta.)',
  '<b>La altura se cobra; el checklist de amenidades, no.</b> Del 10º piso hacia arriba el m² pide {PISO_ALTO}; en cambio la piscina la declara el {PIS_EDIF} de los edificios — requisito de entrada, no diferenciador (§05, con su trampa estadística mostrada).',
  '<b>La preventa publicada casi no descuenta</b> (−2,9% vs entrega inmediata). El descuento real de pozo se negocia en privado y no llega a portales — lo declaramos como límite, no lo inventamos.'],
 nota_mes:''};

/* ============ SLOTS: texto condicional — la DATA elige la plantilla, nunca queda mintiendo ============ */
function slotTC(){
  var d1=CTX.serie[1], br=Math.abs(d1.du-d1.db);
  if(CTX.tcDelta<=-1) return 'El TC retrocedió '+tokPct(CTX.tcDelta)+' en el período: esta vez los precios en Bs se mueven más que en USD — el efecto inverso al de otros cortes. <span>La moneda sigue mandando, ahora al revés.</span>';
  if(br>=CONF.brechaMonedaPts) return 'El precio en dólares y en bolivianos cuentan historias distintas: '+tokPct(d1.du)+' vs '+tokPct(d1.db)+' en el 1 dormitorio. <span>La diferencia es el tipo de cambio ('+tokPct(CTX.tcDelta)+' en el período)</span> — la variable que más planes financieros de la plaza están ignorando.';
  return 'Este corte, las dos monedas cuentan la misma historia ('+tokPct(d1.du)+' ≈ '+tokPct(d1.db)+'): <span>el tipo de cambio estuvo quieto ('+tokPct(CTX.tcDelta)+')</span>. Cuando se mueva, este párrafo lo va a contar.';
}
function slotPeor(){
  var peor=0;[0,1,2].forEach(function(t){if(CTX.serie[t].du<CTX.serie[peor].du)peor=t});
  var nom={0:'monoambiente',1:'1 dormitorio',2:'2 dormitorios'}[peor], s=CTX.serie[peor];
  var enBs=s.db<=-CONF.brechaMonedaPts;
  return '<b>La tipología más golpeada del corte: el '+nom+' ('+tokPct(s.du)+' en USD).</b> '+
   (enBs?'Cae fuerte incluso en bolivianos ('+tokPct(s.db)+') — no es solo efecto del dólar: es debilidad propia del segmento.':'En bolivianos apenas se mueve ('+tokPct(s.db)+'): buena parte de la caída es efecto cambiario, no del segmento.')+
   (peor===2?' Y encaja con una señal independiente: el 2D que sale del mercado es también el más lento en salir ('+META.dias2dSalida+' días de vida mediana, §06).':'');
}
function slotAltura(){
  if(Math.abs(META.pisoAltoPct)>=CONF.umbralContrastePct)
    return 'La altura sí se cobra este corte: del piso 10 hacia arriba el m² pide '+META.pisoAlto+' vs pisos 1º-4º. Altura y edificio premium vienen juntos — el dato no los separa: asociación indicativa, no tarifa por piso.';
  return 'Este corte la altura no muestra un premio claro ('+META.pisoAlto+') — lo declaramos en vez de forzar la historia.';
}
function slotEquip(){
  var pasan=[], rows=CONTRASTES.map(function(c){
    var d=Math.round(100*(c[1]/c[3]-1));
    var nOk=Math.min(c[2],c[4])>=CONF.nMinContraste, ok=Math.abs(d)>=CONF.umbralContrastePct&&nOk;
    var ver= ok?'<b>'+(d>0?'+':'')+d+'%</b>':(!nOk?'n insuf.':'≈ 0');
    if(ok)pasan.push(c[0].toLowerCase()+' ('+(d>0?'+':'')+d+'%)');
    return '<tr><td>'+c[0]+'</td><td class="num">$'+fm(c[1])+' <span style="color:var(--gris)">(n='+c[2]+')</span></td><td class="num">$'+fm(c[3])+' <span style="color:var(--gris)">(n='+c[4]+')</span></td><td class="num">'+ver+'</td></tr>';
  }).join('');
  var pol='Δ≥'+CONF.umbralContrastePct+'% con n≥'+CONF.nMinContraste+' por lado';
  var head= pasan.length?
   'Con la política declarada ('+pol+'), este corte sostiene contraste en: <b>'+pasan.join(', ')+'</b> — indicativo (sin test de significancia; con '+CONTRASTES.length+' atributos barridos, alguno puede pasar por azar). Los positivos pueden ser proxy de edificio más nuevo; los negativos suelen ser composición (el atributo vive en torres de otro perfil), no castigo del atributo.':
   'Con la política declarada ('+pol+'), <b>ningún atributo supera el ruido este corte</b> — y eso también es información.';
  return {head:head, rows:rows};
}
function slotZona(){ /* liderazgo por zona SIN afirmar 'rotación' ni inventar demanda */
  var joven=CTX.zRap, viejo=CTX.zLen;
  var combinada=[CTX.zonas[0],CTX.zonas[1]].filter(function(z){return z===joven})[0];
  var cola=' La oferta más vieja se acumula en '+viejo.nombre+' ('+viejo.dias+' días de antigüedad mediana): pedir menos no le está garantizando salida.';
  var cierre=' (Antigüedad del stock, no tiempo de venta — y admite doble lectura: se renueva, o se re-publica.)';
  if(combinada) return combinada.nombre+' combina <span>m² alto y el stock más joven</span> ('+combinada.dias+' días de antigüedad mediana): su oferta se renueva más que la del resto.'+cola+cierre;
  return 'El m² más alto ('+CTX.zonas[0].nombre+') no coincide con el stock más joven ('+joven.nombre+', '+joven.dias+' días) — precio y renovación van por caminos distintos este corte.'+cola+cierre;
}

/* ============ PROYECTO: la sección 08 se calcula de acá — editar con los datos del cliente real ============ */
var PROYECTO={
 ejemplo:true,               /* true = se etiqueta 'PROYECTO DE MUESTRA' */
 nombre:'Torre Ejemplo',
 lat:-17.7645, lon:-63.2010, /* el terreno (pin) */
 zona:'SI',                  /* código de zona: EC/EN/SI/VB/EO */
 entrega:'2028',
 radioM:500,
 unidades:{0:12,1:24,2:12},  /* mix propuesto por tipología */
 lista:{0:1950,1:1890,2:2050}/* lista de precios $/m² por tipología */
};
/* [oficina, cartera, captadores, captador top, salidas jul (null = <3 u observadas)] — BD 3-ago */
var OF=[
["Business & Residences",34,15,"Yula Cortez Monasterio",7],
["RE/MAX Fortaleza",30,12,"Silvia Raquel Espinoza Caballero",5],
["Forza",25,14,"Andrea Fernandez Balanza",8],
["Rita Quiroga",23,12,"Fernando Talavera",3],
["RE/MAX Union",21,2,"Laurent Lorena Eguez Alvarez",3],
["Home",17,6,"Fernando Lamas Varanda",null],
["RE/MAX Emporio",17,10,"Diego Novak Gomez",null],
["Integra",11,3,"Juliana Gomez Cuellar",null],
["Select",11,8,"Gabriela Fernandez Requena",3],
["Azzero",11,4,"Ariel Mauricio Hubsch Rozenman",5],
["Exclusive",11,8,"Paola Veronica Luzio Riveros",null],
["Norte",9,7,"Andrea Fernandez Osinaga",4],
["BluRealty",9,5,"Annika Byren Bulacia",null],
["Alfa",9,6,"Elizabeth Oconnor",3],
["RE/MAX Black",9,6,"Lourdes Stephannie Bonilla Rojas",null],
["Signature",9,6,"Adriana Salazar",null],
["— 43 oficinas más —",146,null,null,null]
];
/* el portal de C21 publica solo el nombre de la franquicia; Remax incluye su marca.
   Para no des-distinguir redes, todo nombre sin prefijo RE/MAX es Century 21 (verificado por fuente). */
function ofiLbl(n){ if(!n)return n;
  if(n.indexOf('RE/MAX')===0||n.charAt(0)==='—')return n;
  return 'C21 '+n;}
