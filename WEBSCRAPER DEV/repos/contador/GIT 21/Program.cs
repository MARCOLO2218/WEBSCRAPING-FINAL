using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace GIT_21
{
     class Program
    {
        static void Main(string[] args)
        {
            // Asignación compuesta (x -= 5) == (x = x - 5)

            int i;
            int contador = 0;

            //for (i = 10; i >= 1; Console.WriteLine("Valor de salida: {0}", i), i--)
            //de uno es uno
            //for (i = 1; i <= 10; i++)
            // de dos en dos
            for (i = 0; i <= 20; i += 2)
            {
                //distitas formas de incrementar el contador
                //contador += 1;
                //contador++;
                // de dos en dos
                contador += 1 ;
                Console.WriteLine("{0}, Vuelta del ciclio número {1}", i, contador);
            }

            Console.WriteLine("El numero de vueltas que dio el ciclo fue: {0}", contador);
        }
    }
}
