import slide0 from '../../Images/01-profile.jpeg';
import slide1 from '../../Images/02-highlights.jpeg';
import slide2 from '../../Images/03-education.jpeg';
import slide3 from '../../Images/04-mata-labs.jpeg';
import slide4 from '../../Images/05-initiatives.jpeg';
import slide5 from '../../Images/06-contact.jpeg';

// Link bounds use the 1279 x 1600 artwork coordinates.
export const slidesData = [
  {
    "id": 0,
    "title": "Kiriti Mortha",
    "bgTheme": "dark",
    "imagePath": slide0,
    "alt": "Kiriti Mortha, Director, MATA Labs OPC. Communication Design. Portrait of Kiriti Mortha."
  },
  {
    "id": 1,
    "title": "Highlights",
    "bgTheme": "light",
    "imagePath": slide1,
    "alt": "Highlights: Australian Government experience; Master of Public Policy, University of Sydney; President of Student Union, University of Sydney. Recommended by Dr Micheal Spence."
  },
  {
    "id": 2,
    "title": "Education",
    "bgTheme": "light",
    "imagePath": slide2,
    "alt": "Education: Master of Public Policy, University of Sydney; Bachelor of Economics (Hons), Christ University. Schooling: HPS Begumpet, The Lawrence School Lovedale, Visakha Valley School. AP basketball captain and gold medallist in Literature in English."
  },
  {
    "id": 3,
    "title": "MATA Labs",
    "bgTheme": "light",
    "imagePath": slide3,
    "alt": "MATA Labs: Strategy, Design, and Subject Matter Expertise in public policy, law, economics and politics. Craft obsessed. AI harnessed."
  },
  {
    "id": 4,
    "title": "Initiatives",
    "bgTheme": "light",
    "imagePath": slide4,
    "alt": "Initiatives: SDOT, independent political intelligence for the Telugu states, instagram.com/sdot.in. BandForge, an AI-powered IELTS product, bandforge.study.",
    "links": [
      {
        "label": "SDOT on Instagram",
        "href": "https://www.instagram.com/sdot.in/",
        "bounds": [
          150,
          560,
          1020,
          275
        ]
      },
      {
        "label": "BandForge website",
        "href": "https://bandforge.study/",
        "bounds": [
          170,
          1110,
          960,
          180
        ]
      }
    ]
  },
  {
    "id": 5,
    "title": "Contact",
    "bgTheme": "dark",
    "imagePath": slide5,
    "alt": "Kiriti Mortha, Director, MATA Labs OPC. Instagram: @kiriti.mortha. Email: director@matalabs.io. Phone / WhatsApp: +91 91003 60999. LinkedIn: linkedin.com/in/k-mortha.",
    "links": [
      {
        "label": "Kiriti Mortha on Instagram",
        "href": "https://www.instagram.com/kiriti.mortha/",
        "bounds": [
          100,
          575,
          1035,
          105
        ]
      },
      {
        "label": "Email director@matalabs.io",
        "href": "mailto:director@matalabs.io",
        "bounds": [
          100,
          745,
          1035,
          105
        ]
      },
      {
        "label": "Contact Kiriti Mortha on WhatsApp",
        "href": "https://wa.me/919100360999",
        "bounds": [
          100,
          910,
          1035,
          105
        ]
      },
      {
        "label": "Kiriti Mortha on LinkedIn",
        "href": "https://www.linkedin.com/in/k-mortha/",
        "bounds": [
          100,
          1080,
          1035,
          105
        ]
      }
    ]
  }
];
